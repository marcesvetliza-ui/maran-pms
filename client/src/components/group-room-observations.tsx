export function GroupRoomObservations({
  groupNotes,
  roomNotes,
}: {
  groupNotes?: string | null;
  roomNotes?: string | null;
}) {
  return (
    <>
      {groupNotes?.trim() && (
        <div className="whitespace-pre-wrap break-words" data-testid="group-room-observations-group">
          <span className="font-medium">Grupo:</span> {groupNotes}
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