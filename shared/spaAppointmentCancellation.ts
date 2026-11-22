import { z } from 'zod';

/** Cancels the schedule only; financial and identity fields are never accepted. */
export const spaAppointmentCancellationSchema = z.object({
  status: z.literal('cancelled'),
  motivoAnulacion: z.string().trim().min(1, 'Indicá el motivo de cancelación').max(2000, 'El motivo no puede superar los 2000 caracteres'),
}).strict();
