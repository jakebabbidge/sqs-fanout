import { Client } from './Client';
import { SQS, SNS } from 'aws-sdk';

export function generateARN(service: 'sqs' | 'sns', region: string, accountID: string, resourceName: string): string {
	return 'arn:aws:' + service + ':' + region + ':' + accountID + ':' + resourceName;
}

export type ResourceList = Resource[];

class Resource {
	constructor() {}

	toString() {
		return 'Blank Resource';
	}

	async ensureAndCreate(client: Client) {
		throw new Error('Attempted to create blank resource! Use SNSResource, SQSResource or TopicSubscriptionResource');
	}
}

export class SNSResource extends Resource {
	public topicName: string;
	public region: string;

	constructor(topicName: string, region: string) {
		super();

		this.topicName = topicName;
		this.region = region;
	}

	toString() {
		return 'sns.' + this.topicName + '.' + this.region;
	}

	async ensureAndCreate(client: Client) {
		console.log('Creating SNSResource: ' + this.topicName);
		await client.snsClient
			.createTopic({
				Name: this.topicName,
			})
			.promise();
	}
}

export class SQSResource extends Resource {
	public queueName: string;
	public region: string;
	public policyType: 'none' | 'all-sns';

	constructor(queueName: string, region: string, policyType: 'none' | 'all-sns') {
		super();

		this.queueName = queueName;
		this.region = region;
		this.policyType = policyType;
	}

	toString() {
		return 'sqs.' + this.queueName + '.' + this.region;
	}

	async ensureAndCreate(client: Client) {
		console.log('Creating SQSResource: ' + this.queueName);
		let attributes: SQS.QueueAttributeMap = {};

		if (this.policyType == 'all-sns') {
			let accountID = await client.getAccountID();
			let newARN = generateARN('sqs', this.region, accountID, this.queueName);
			attributes['Policy'] = JSON.stringify({
				Version: '2012-10-17',
				Id: 'Policy1645582105705',
				Statement: [
					{
						Sid: 'Stmt1645582011402',
						Effect: 'Allow',
						Principal: {
							AWS: 'arn:aws:iam::' + accountID + ':root',
							Service: 'sns.amazonaws.com',
						},
						Action: 'SQS:*',
						Resource: newARN,
					},
				],
			});
		}

		await client.sqsClient
			.createQueue({
				QueueName: this.queueName,
				Attributes: attributes,
			})
			.promise();
	}
}

export class TopicSubscriptionResource extends Resource {
	public sns: SNSResource;
	public sqs: SQSResource;
	public filterPolicy: any | null;

	constructor(sns: SNSResource, sqs: SQSResource, filterPolicy: any | null) {
		super();

		this.sns = sns;
		this.sqs = sqs;
		this.filterPolicy = filterPolicy;
	}

	toString() {
		return 'subscription[' + this.sqs.toString() + ',' + this.sns.toString() + ',' + JSON.stringify(this.filterPolicy) + ']';
	}

	async ensureAndCreate(client: Client) {
		console.log('Creating TopicSubscriptionResource: {topic: '+this.sns.topicName+', queue: '+this.sqs.queueName+', policy: '+JSON.stringify(this.filterPolicy)+'}');
		let attributes: SNS.SubscriptionAttributesMap = {};
		if (this.filterPolicy != null) {
			attributes['FilterPolicy'] = JSON.stringify(this.filterPolicy);
		}

		let accountID = await client.getAccountID();
		let snsARN = generateARN('sns', this.sns.region, accountID, this.sns.topicName);
		let sqsARN = generateARN('sqs', this.sqs.region, accountID, this.sqs.queueName);

		await client.snsClient
			.subscribe({
				TopicArn: snsARN,
				Protocol: 'sqs',
				Endpoint: sqsARN,
				Attributes: attributes,
			})
			.promise();
	}
}
