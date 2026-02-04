import { UserInfo } from './types/user-info';

export abstract class TwitterApiProvider {
  constructor() {}
  abstract getUserInfo(username: string): Promise<UserInfo>;
}
