export type UserInfo = {
  type: string;
  userName: string;
  url?: string;
  id: string;
  followers: number;
};

export type GetUserInfoResponse<T> = {
  data: T;
  status: "success" | "error";
  msg: string;
};