import {fireEvent,render,screen} from "@testing-library/react";
import {describe,it,expect,vi} from "vitest";
vi.mock("@/App",()=>({useAuth:()=>({user:{role:"admin"},hasPermission:()=>true})}));
vi.mock("@/hooks/use-bed-catalog",()=>({useBedCatalog:()=>({label:()=>""})}));
vi.mock("@/components/housekeeping-preparation",()=>({HousekeepingPreparationControl:()=>null}));
import {RoomCard,MobileRoomCard} from "./housekeeping";
import type {RoomWithType,HousekeepingTaskWithRoom} from "@shared/schema";
import {getArgentinaToday} from "@/lib/date-utils";
const room={id:"room",roomNumber:"201",status:"dirty",floor:2,roomType:{code:"DBL"}} as RoomWithType;
const active={id:"old",roomId:"room",taskType:"checkout_clean",priority:"normal",status:"in_progress",scheduledDate:"2020-01-01",startedAt:new Date()} as HousekeepingTaskWithRoom;
const pending={...active,id:"new",status:"pending",scheduledDate:getArgentinaToday()} as HousekeepingTaskWithRoom;
const callbacks=()=>({onStartTask:vi.fn(),onCompleteTask:vi.fn(),onCreateTask:vi.fn(),onUpdateStatus:vi.fn(),onOpenDetails:vi.fn(),onEditBedConfig:vi.fn()});
describe("Housekeeping room actions",()=>{
 it("desktop exposes earlier ongoing work instead of offering a conflicting start",()=>{
  const handlers=callbacks();
  render(<RoomCard room={room} tasks={[pending,active]} isOccupied={false} {...handlers}/>);
  expect(screen.getByText(/En curso desde/)).toBeInTheDocument();
  expect(screen.queryByTestId("button-start-task-new")).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId("button-complete-task-old"));
  expect(handlers.onCompleteTask).toHaveBeenCalledWith("old");
 });
 it("mobile changes status immediately without confirmation",()=>{
  const handlers=callbacks();
  render(<MobileRoomCard room={room} tasks={[]} isOccupied={false} checkoutToday={false} checkinToday={false}
    {...handlers} onInspectTask={vi.fn()} onQuickStart={vi.fn()} isUpdating={false} canManage/>);
  fireEvent.click(screen.getByTestId("button-set-available-room"));
  expect(handlers.onUpdateStatus).toHaveBeenCalledWith("room","available");
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
 });
 it("mobile names the unfinished task and offers completion, not another start",()=>{
  render(<MobileRoomCard room={room} tasks={[pending,active]} isOccupied={false} checkoutToday={false} checkinToday={false}
    {...callbacks()} onInspectTask={vi.fn()} onQuickStart={vi.fn()} isUpdating={false} canManage/>);
  expect(screen.getByText(/Tarea sin finalizar desde/)).toBeInTheDocument();
  expect(screen.getByTestId("button-complete-task-old")).toBeInTheDocument();
  expect(screen.queryByTestId("button-start-task-new")).not.toBeInTheDocument();
 });
});
