import { SpaPrefactura } from "./spa-prefactura";

export function SpaFundingConnectedPanel(props: {
  accountId: string; userId: string; canWrite: boolean; canAdopt?: boolean;
  onCompleted?: () => void; onRoomTransfer?: () => void;
}) {
  return <SpaPrefactura {...props}/>;
}
