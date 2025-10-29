export class CheckDatabaseStatusDto {
  userId: string;
}

export class DatabaseStatusResponseDto {
  userId: string;
  isDatabaseCreated: boolean;
  message: string;
}
