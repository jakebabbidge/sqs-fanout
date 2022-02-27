import { DependencyManager, DependencyRequesterFunction } from './DependencyManager';
import { STS, SQS, SNS } from 'aws-sdk';
import { generateARN, SNSResource } from './Resources';

export type ClientOptions = {
	mockClient: boolean;
};

export type SNSMessage = {
	stringContent : string;
	attributes? : SNS.MessageAttributeMap;
};

export type SNSPublish = {
	topic: SNSResource;
	message: SNSMessage;
	dependencyIdentifier?: string;
	getDependencies: DependencyRequesterFunction;
};

export class Client {
	private options: ClientOptions;
	private dependencyManager: DependencyManager;

	private accountID: string | null = null;
	public sqsClient: SQS;
	public snsClient: SNS;

	constructor(options: ClientOptions) {
		this.options = options;

		this.dependencyManager = new DependencyManager();
		this.sqsClient = new SQS();
		this.snsClient = new SNS();
	}

	isMockClient(): boolean {
		return this.options.mockClient;
	}

	async publish(publishCommand: SNSPublish) {
		// Create resources
		await this.dependencyManager.satisfySNSPublishDependencies(this, publishCommand);

		let accountID = await this.getAccountID();
		let topicARN = generateARN('sns', publishCommand.topic.region, accountID, publishCommand.topic.topicName);

		console.log("Sending SNS Message");
		await this.snsClient.publish({
			Message: publishCommand.message.stringContent,
			TopicArn: topicARN,
			MessageAttributes: publishCommand.message.attributes
		}).promise();
	}

	async getAccountID(): Promise<string> {
		// Lazy load grab accountID
		if (this.accountID) {
			return this.accountID;
		} else {
			const sts = new STS();
			let ret = await sts.getCallerIdentity({}).promise();
			if (ret.Account) {
				this.accountID = ret.Account;
				return ret.Account;
			} else {
				throw new Error('Account Load Failed');
			}
		}
	}
}
