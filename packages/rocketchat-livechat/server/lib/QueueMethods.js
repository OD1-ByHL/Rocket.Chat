import { Meteor } from 'meteor/meteor';
import { TAPi18n } from 'meteor/tap:i18n';
import { Rooms, Subscriptions, Users } from 'meteor/rocketchat:models';
import { settings } from 'meteor/rocketchat:settings';
import _ from 'underscore';
import { sendNotification } from 'meteor/rocketchat:lib';
import { LivechatInquiry } from '../../lib/LivechatInquiry';
import { Livechat } from './Livechat';

export const QueueMethods = {
	/* Least Amount Queuing method:
	 *
	 * default method where the agent with the least number
	 * of open chats is paired with the incoming livechat
	 */
	'Least_Amount'(guest, message, roomInfo, agent) {
		if (!agent) {
			agent = Livechat.getNextAgent(guest.department);
			if (!agent) {
				throw new Meteor.Error('no-agent-online', 'Sorry, no online agents');
			}
		}

		Rooms.updateLivechatRoomCount();

		const room = _.extend({
			_id: message.rid,
			msgs: 0,
			usersCount: 1,
			lm: new Date(),
			fname: (roomInfo && roomInfo.fname) || guest.name || guest.username,
			// usernames: [agent.username, guest.username],
			t: 'l',
			ts: new Date(),
			v: {
				_id: guest._id,
				username: guest.username,
				token: message.token,
				status: guest.status || 'online',
			},
			servedBy: {
				_id: agent.agentId,
				username: agent.username,
				ts: new Date(),
			},
			cl: false,
			open: true,
			waitingResponse: true,
		}, roomInfo);

		const subscriptionData = {
			rid: message.rid,
			fname: guest.name || guest.username,
			alert: true,
			open: true,
			unread: 1,
			userMentions: 1,
			groupMentions: 0,
			u: {
				_id: agent.agentId,
				username: agent.username,
			},
			t: 'l',
			desktopNotifications: 'all',
			mobilePushNotifications: 'all',
			emailNotifications: 'all',
		};

		if (guest.department) {
			room.departmentId = guest.department;
		}

		Rooms.insert(room);

		Subscriptions.insert(subscriptionData);

		Livechat.stream.emit(room._id, {
			type: 'agentData',
			data: Users.getAgentInfo(agent.agentId),
		});

		return room;
	},
	/* Guest Pool Queuing Method:
	 *
	 * An incomming livechat is created as an Inquiry
	 * which is picked up from an agent.
	 * An Inquiry is visible to all agents (TODO: in the correct department)
     *
	 * A room is still created with the initial message, but it is occupied by
	 * only the client until paired with an agent
	 */
	'Guest_Pool'(guest, message, roomInfo) {
		let agents = Livechat.getOnlineAgents(guest.department);

		if (agents.count() === 0 && settings.get('Livechat_guest_pool_with_no_agents')) {
			agents = Livechat.getAgents(guest.department);
		}

		if (agents.count() === 0) {
			throw new Meteor.Error('no-agent-online', 'Sorry, no online agents');
		}

		Rooms.updateLivechatRoomCount();

		const agentIds = [];

		agents.forEach((agent) => {
			if (guest.department) {
				agentIds.push(agent.agentId);
			} else {
				agentIds.push(agent._id);
			}
		});

		const inquiry = {
			rid: message.rid,
			message: message.msg,
			name: guest.name || guest.username,
			ts: new Date(),
			department: guest.department,
			agents: agentIds,
			status: 'open',
			v: {
				_id: guest._id,
				username: guest.username,
				token: message.token,
				status: guest.status || 'online',
			},
			t: 'l',
		};

		const room = _.extend({
			_id: message.rid,
			msgs: 0,
			usersCount: 0,
			lm: new Date(),
			fname: guest.name || guest.username,
			// usernames: [guest.username],
			t: 'l',
			ts: new Date(),
			v: {
				_id: guest._id,
				username: guest.username,
				token: message.token,
				status: guest.status,
			},
			cl: false,
			open: true,
			waitingResponse: true,
		}, roomInfo);

		if (guest.department) {
			room.departmentId = guest.department;
		}

		LivechatInquiry.insert(inquiry);
		Rooms.insert(room);

		// Alert the agents of the queued request
		agentIds.forEach((agentId) => {
			sendNotification({
				// fake a subscription in order to make use of the function defined above
				subscription: {
					rid: room._id,
					t : room.t,
					u: {
						_id : agentId,
					},
				},
				sender: room.v,
				hasMentionToAll: true, // consider all agents to be in the room
				hasMentionToHere: false,
				message: Object.assign(message, { u: room.v }),
				notificationMessage: message.msg,
				room: Object.assign(room, { name: TAPi18n.__('New_livechat_in_queue') }),
				mentionIds: [],
			});
		});
		return room;
	},
	'External'(guest, message, roomInfo, agent) {
		return this['Least_Amount'](guest, message, roomInfo, agent); // eslint-disable-line
	},
};
