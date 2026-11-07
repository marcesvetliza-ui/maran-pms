import {useQuery} from '@tanstack/react-query';
import {apiRequest} from '@/lib/queryClient';

type UserIdentity={id:string;role:string};
type Permissions={role:string;resourceKeys:string[]};

export function useSessionPermissions(user:UserIdentity|null){
  const query=useQuery<Permissions>({
    // Never reuse another account's cached permissions on a same-browser login.
    queryKey:['/api/permissions/mine',user?.id,user?.role],
    queryFn:async()=> (await apiRequest('GET','/api/permissions/mine')).json(),
    enabled:!!user,
  });
  // A failed background refetch changes isSuccess to false, even when the
  // last successful data is still available. Keep the current screen mounted.
  const ready=!!user && query.data?.role===user.role && Array.isArray(query.data.resourceKeys);
  return {...query,ready,resourceKeys:ready?query.data!.resourceKeys:[]};
}
