import { Client, SNSPublish } from "./Client";
import { DeferredPromise } from "./DeferredPromise";
import { ResourceList } from "./Resources";

export type DependencyRequesterFunction = () => ResourceList;

export class DependencyManager {
	
	// Store whether each dependency identifier is currently processing
	private dependencyProcessing : Record<string, boolean> = {};
	// Store all promises waiting for a dependency to finish completion
	private dependencySatisfactionPromises : Record<string, DeferredPromise<void>[]> = {};

	// Store all cached values of whether each dependency identifier is already satisfied
	private dependencySatisfiedCache : Record<string, boolean> = {};

	constructor () {

	}

	satisfySNSPublishDependencies (client : Client, publishCommand : SNSPublish) : Promise<void> {
		let dependencyIdentifier = publishCommand.dependencyIdentifier;
		
		let dependencies : ResourceList | null = null;
		// If custom identifier is not set, we cannot use optimisation, and recalculate each time
		if (dependencyIdentifier == null) {
			dependencies = publishCommand.getDependencies();
			
			dependencyIdentifier = "";
			for (let i = 0; i < dependencies.length; i++) {
				dependencyIdentifier += dependencies[i].toString() + "_";
			}
		}

		if (dependencyIdentifier in this.dependencySatisfiedCache) {
			return Promise.resolve();
		} else {
			if (dependencyIdentifier in this.dependencyProcessing) {
				// This dependency is being fulfilled currently. Just wait
				let thisPromise = new DeferredPromise<void>();
				this.dependencySatisfactionPromises[dependencyIdentifier].push(thisPromise);

				return thisPromise.promise;
			} else {
				// Not processing and not in cache. This is a fresh case
				if (dependencies == null) {
					dependencies = publishCommand.getDependencies();
				}

				this.dependencyProcessing[dependencyIdentifier] = true;

				let thisPromise = new DeferredPromise<void>();
				this.dependencySatisfactionPromises[dependencyIdentifier] = [thisPromise];

				this.satisfyDependencies(client, dependencyIdentifier, dependencies);

				return thisPromise.promise;
			}
		}
	}

	async satisfyDependencies (client : Client, identifier : string, resources : ResourceList) {
		// Ensure and create each resource sequentially
		for (let i = 0; i < resources.length; i++) {
			await resources[i].ensureAndCreate(client);
		}

		// Satisfy all waiting promises
		let deferredPromises = this.dependencySatisfactionPromises[identifier];
		for (let i = 0; i < deferredPromises.length; i++) {
			deferredPromises[i].resolve();
		}
		this.dependencySatisfactionPromises[identifier] = [];
		
		// Register that this dependency is now satisfied
		this.dependencySatisfiedCache[identifier] = true;
	}
}