import { GroupCommercialAgreement } from './group-commercial-agreement';

export function GroupRoomObservations({
  groupNotes,
  roomNotes,
  groupMasterFolioConfig,
}: {
  groupNotes?: string | null;
  roomNotes?: string | null;
  groupMasterFolioConfig?: string | null;
}) {
  return (
    <>
      {groupMasterFolioConfig != null && <GroupCommercialAgreement config={groupMasterFolioConfig} />}
      {groupNotes?.trim() && (
        <div className="whitespace-pre-wrap break-words" data-testid="group-room-observations-group">
          {groupNotes}
        </div>
      )}
      {roomNotes?.trim() && (
        <div className="whitespace-pre-wrap break-words" data-testid="group-room-observations-room">
          <span className="font-medium">Habitación:</span> {roomNotes}
        </div>
      )}
    </>
  );
}
