import {useQuery} from '@tanstack/react-query';
import {apiRequest} from '@/lib/queryClient';
export type ChannexAccess={owner:boolean;entry:boolean;status:boolean;read:boolean;config:boolean;bookings:boolean;sync:boolean};
// The sidebar owns periodic refresh. Panels share its cache and do not each
// start another polling timer for the same permissions.
export function useChannexAccess({poll = false}: {poll?: boolean} = {}){return useQuery<ChannexAccess>({queryKey:['/api/channex/access'],queryFn:async()=> (await apiRequest('GET','/api/channex/access')).json(),staleTime:30_000,refetchInterval:poll ? 60_000 : false});}
