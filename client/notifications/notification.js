import { Meteor } from 'meteor/meteor';
import { Tracker } from 'meteor/tracker';
import { FlowRouter } from 'meteor/kadira:flow-router';
import { Session } from 'meteor/session';
import { KonchatNotification } from 'meteor/rocketchat:ui';
import { CachedChatSubscription } from 'meteor/rocketchat:models';
import { fireGlobalEvent, readMessage, Layout } from 'meteor/rocketchat:ui-utils';
import { getUserPreference } from 'meteor/rocketchat:utils';
import { Notifications } from 'meteor/rocketchat:notifications';

// Show notifications and play a sound for new messages.
// We trust the server to only send notifications for interesting messages, e.g. direct messages or
// group messages in which the user is mentioned.

function notifyNewRoom(sub) {

	// Do not play new room sound if user is busy
	if (Session.equals(`user_${ Meteor.userId() }_status`, 'busy')) {
		return;
	}

	if ((!FlowRouter.getParam('name') || FlowRouter.getParam('name') !== sub.name) && !sub.ls && sub.alert === true) {
		return KonchatNotification.newRoom(sub.rid);
	}
}

Meteor.startup(function() {
	Tracker.autorun(function() {
		if (Meteor.userId()) {
			Notifications.onUser('notification', function(notification) {

				let openedRoomId = undefined;
				if (['channel', 'group', 'direct'].includes(FlowRouter.getRouteName())) {
					openedRoomId = Session.get('openedRoom');
				}

				// This logic is duplicated in /client/startup/unread.coffee.
				const hasFocus = readMessage.isEnable();
				const messageIsInOpenedRoom = openedRoomId === notification.payload.rid;
				const muteFocusedConversations = getUserPreference(Meteor.userId(), 'muteFocusedConversations');

				fireGlobalEvent('notification', {
					notification,
					fromOpenedRoom: messageIsInOpenedRoom,
					hasFocus,
				});

				if (Layout.isEmbedded()) {
					if (!hasFocus && messageIsInOpenedRoom) {
						// Play a sound and show a notification.
						KonchatNotification.newMessage(notification.payload.rid);
						KonchatNotification.showDesktop(notification);
					}
				} else if (!hasFocus || !messageIsInOpenedRoom) {
					// Play a sound and show a notification.
					KonchatNotification.newMessage(notification.payload.rid);
					KonchatNotification.showDesktop(notification);
				} else if (!muteFocusedConversations) {
					// Play a notification sound
					KonchatNotification.newMessage(notification.payload.rid);
				}
			});

			Notifications.onUser('audioNotification', function(notification) {

				const openedRoomId = Session.get('openedRoom');

				// This logic is duplicated in /client/startup/unread.coffee.
				const hasFocus = readMessage.isEnable();
				const messageIsInOpenedRoom = openedRoomId === notification.payload.rid;
				const muteFocusedConversations = getUserPreference(Meteor.userId(), 'muteFocusedConversations');

				if (Layout.isEmbedded()) {
					if (!hasFocus && messageIsInOpenedRoom) {
						// Play a notification sound
						KonchatNotification.newMessage(notification.payload.rid);
					}
				} else if (!hasFocus || !messageIsInOpenedRoom || !muteFocusedConversations) {
					// Play a notification sound
					KonchatNotification.newMessage(notification.payload.rid);
				}
			});

			CachedChatSubscription.onSyncData = function(action, sub) {
				if (action !== 'removed') {
					notifyNewRoom(sub);
				}
			};

			Notifications.onUser('subscriptions-changed', (action, sub) => {
				notifyNewRoom(sub);
			});
		}
	});
});
