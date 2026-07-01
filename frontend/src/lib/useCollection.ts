import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { pb } from "./pb";
import type { PlatformRecord } from "./types";

type Options = { sort?: string; expand?: string };

// Generic CRUD bound to a PocketBase collection, wired to TanStack Query so
// the list refreshes automatically after any mutation.
export function useCollection<T extends { id: string }>(
  name: string,
  options: Options = {},
) {
  const qc = useQueryClient();
  const key = [name, options.sort, options.expand];
  const invalidate = () => qc.invalidateQueries({ queryKey: [name] });

  const list = useQuery({
    queryKey: key,
    queryFn: () =>
      pb.collection(name).getFullList<T>({
        sort: options.sort ?? "-created",
        expand: options.expand,
        // Disable the SDK's auto-cancellation: React StrictMode fires the
        // query twice in dev, which would otherwise cancel the first request
        // and intermittently yield an empty list.
        requestKey: null,
      }),
  });

  const create = useMutation({
    mutationFn: (data: Record<string, unknown>) => pb.collection(name).create<T>(data),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      pb.collection(name).update<T>(id, data),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => pb.collection(name).delete(id),
    onSuccess: invalidate,
  });

  return { list, create, update, remove };
}

// Active platform names, for the platform dropdowns.
export function usePlatformNames(): string[] {
  const { list } = useCollection<PlatformRecord>("platforms", { sort: "name" });
  return (list.data ?? []).filter((p) => p.active !== false).map((p) => p.name);
}
