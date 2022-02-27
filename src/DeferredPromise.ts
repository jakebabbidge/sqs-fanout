export class DeferredPromise<T> {
	public promise: Promise<T>;

	public resolve: (value: T | PromiseLike<T>) => void = () => {
		console.error('RESOLVE FAIL');
	};
	public reject: (reason?: any) => void = () => {
		console.error('REJECT FAIL');
	};

	constructor() {
		this.promise = new Promise<T>((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}
