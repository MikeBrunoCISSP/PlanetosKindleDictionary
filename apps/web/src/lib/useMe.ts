import { useQuery } from "@tanstack/react-query";
import { apiMe } from "./api.js";
import type { UserDto } from "@planetos/shared";

export const ME_QUERY_KEY = ["auth", "me"] as const;

export function useMe(): UserDto | null | undefined {
  const { data } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: apiMe,
    staleTime: 5 * 60 * 1000,
  });
  return data;
}
