import { z } from "zod";

export const botStatusSchema = z.object({
  status: z.enum(["idle", "authenticating", "launching", "logging_in", "connected", "navigating", "error", "disconnected"]),
  message: z.string(),
  roomUrl: z.string().optional(),
  timestamp: z.number(),
});

export const botCommandSchema = z.object({
  action: z.enum(["start", "stop", "move", "look", "jump", "enter_room"]),
  payload: z.record(z.any()).optional(),
});

export const moveCommandSchema = z.object({
  direction: z.enum(["forward", "backward", "left", "right", "stop"]),
  duration: z.number().optional(),
});

export const roomCommandSchema = z.object({
  roomUrl: z.string().url(),
});

export type BotStatus = z.infer<typeof botStatusSchema>;
export type BotCommand = z.infer<typeof botCommandSchema>;
export type MoveCommand = z.infer<typeof moveCommandSchema>;
export type RoomCommand = z.infer<typeof roomCommandSchema>;

export const users = {} as any;
export type User = { id: string; username: string; password: string };
export type InsertUser = { username: string; password: string };
