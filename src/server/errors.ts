// Expected, user-facing failures. The message is Norwegian and safe to show; never put internals in it.
export class AppError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
  }
}

export const fail = (message: string, status = 422): never => {
  throw new AppError(status, message);
};
