import {useQuery} from '@tanstack/react-query';
import {apiRequest} from '@/lib/queryClient';
export type ChannexAccess={owner:boolean;entry:boolean;status:boolean;read:boolean;config:boolean;bookings:boolean;sync:boolean};
export function useChannexAccess(){return useQuery<ChannexAccess>({queryKey:['/api/channex/access'],queryFn:async()=> (await apiRequest('GET','/api/channex/access')).json(),staleTime:0,refetchInterval:30000});}
