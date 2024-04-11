export class LockAcquisitionError extends Error {
    constructor(public readonly message: string) {
        super();
        this.name = "LockAcquisitionError";
    }
}

export class LockRenewalError extends Error {
    constructor(public readonly message: string) {
        super();
        this.name = "LockRemovalError";
    }
}

export class LockRemovalError extends Error {
    constructor(public readonly message: string) {
        super();
        this.name = "LockRemovalError";
    }
}