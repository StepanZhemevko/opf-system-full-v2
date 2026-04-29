import api from "./client";

export type RegisterPayload = {
  email: string;
  username: string;
  password: string;
};

export type LoginPayload = {
  username: string;
  password: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
};

export type CurrentUser = {
  id: number;
  email: string;
  username: string;
};

export async function registerUser(payload: RegisterPayload): Promise<CurrentUser> {
  const response = await api.post<CurrentUser>("/auth/register", payload, {
    headers: {
      "Content-Type": "application/json",
    },
  });
  return response.data;
}

export async function loginUser(payload: LoginPayload): Promise<TokenResponse> {
  const form = new URLSearchParams();
  form.append("username", payload.username);
  form.append("password", payload.password);

  const response = await api.post<TokenResponse>("/auth/login", form.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  return response.data;
}

export async function getMe(): Promise<CurrentUser> {
  const response = await api.get<CurrentUser>("/auth/me");
  return response.data;
}