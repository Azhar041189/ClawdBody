/**
 * TaskQueue
 * Priority queue for task scheduling
 */

import type { Task, TaskPriority, TaskStatus } from '../types';

interface QueuedTask extends Task {
  queuedAt: Date;
}

type PriorityValue = 0 | 1 | 2 | 3;

const PRIORITY_VALUES: Record<TaskPriority, PriorityValue> = {
  p0: 0,
  p1: 1,
  p2: 2,
  p3: 3,
};

export interface TaskQueueOptions {
  maxSize?: number;
  maxConcurrent?: number;
}

/**
 * TaskQueue manages prioritized task execution
 */
export class TaskQueue {
  private queue: QueuedTask[] = [];
  private processing: Map<string, QueuedTask> = new Map();
  private maxSize: number;
  private maxConcurrent: number;
  private taskHandlers: Map<string, (task: Task) => Promise<void>> = new Map();

  constructor(options?: TaskQueueOptions) {
    this.maxSize = options?.maxSize ?? 1000;
    this.maxConcurrent = options?.maxConcurrent ?? 4;
  }

  /**
   * Add a task to the queue
   */
  enqueue(task: Task): boolean {
    if (this.queue.length >= this.maxSize) {
      return false;
    }

    const queuedTask: QueuedTask = {
      ...task,
      status: 'queued',
      queuedAt: new Date(),
    };

    // Insert in priority order
    const insertIndex = this.findInsertIndex(queuedTask);
    this.queue.splice(insertIndex, 0, queuedTask);

    return true;
  }

  /**
   * Find insertion index for maintaining priority order
   */
  private findInsertIndex(task: QueuedTask): number {
    const taskPriority = PRIORITY_VALUES[task.priority];

    for (let i = 0; i < this.queue.length; i++) {
      const queuePriority = PRIORITY_VALUES[this.queue[i].priority];
      if (taskPriority < queuePriority) {
        return i;
      }
    }

    return this.queue.length;
  }

  /**
   * Get the next task to process
   */
  dequeue(): Task | null {
    if (this.queue.length === 0) {
      return null;
    }

    if (this.processing.size >= this.maxConcurrent) {
      return null;
    }

    const task = this.queue.shift();
    if (!task) return null;

    task.status = 'running';
    task.startedAt = new Date();
    this.processing.set(task.id, task);

    return task;
  }

  /**
   * Get next task for a specific agent
   */
  dequeueForAgent(agentId: string): Task | null {
    const index = this.queue.findIndex(
      (t) => !t.agentId || t.agentId === agentId
    );

    if (index === -1) return null;
    if (this.processing.size >= this.maxConcurrent) return null;

    const [task] = this.queue.splice(index, 1);
    task.status = 'running';
    task.startedAt = new Date();
    task.agentId = agentId;
    this.processing.set(task.id, task);

    return task;
  }

  /**
   * Mark a task as completed
   */
  complete(taskId: string, result?: Task['result']): Task | null {
    const task = this.processing.get(taskId);
    if (!task) return null;

    task.status = 'completed';
    task.completedAt = new Date();
    task.result = result;
    this.processing.delete(taskId);

    return task;
  }

  /**
   * Mark a task as failed
   */
  fail(taskId: string, error: string): Task | null {
    const task = this.processing.get(taskId);
    if (!task) return null;

    task.status = 'failed';
    task.completedAt = new Date();
    task.result = {
      success: false,
      error,
    };
    this.processing.delete(taskId);

    return task;
  }

  /**
   * Cancel a task
   */
  cancel(taskId: string): boolean {
    // Check processing
    if (this.processing.has(taskId)) {
      const task = this.processing.get(taskId)!;
      task.status = 'cancelled';
      this.processing.delete(taskId);
      return true;
    }

    // Check queue
    const index = this.queue.findIndex((t) => t.id === taskId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }

    return false;
  }

  /**
   * Get a task by ID
   */
  get(taskId: string): Task | null {
    // Check processing
    const processing = this.processing.get(taskId);
    if (processing) return processing;

    // Check queue
    const queued = this.queue.find((t) => t.id === taskId);
    return queued ?? null;
  }

  /**
   * Get queue status
   */
  status(): {
    queued: number;
    processing: number;
    maxSize: number;
    maxConcurrent: number;
  } {
    return {
      queued: this.queue.length,
      processing: this.processing.size,
      maxSize: this.maxSize,
      maxConcurrent: this.maxConcurrent,
    };
  }

  /**
   * Get all queued tasks
   */
  getQueued(): Task[] {
    return [...this.queue];
  }

  /**
   * Get all processing tasks
   */
  getProcessing(): Task[] {
    return Array.from(this.processing.values());
  }

  /**
   * Get tasks by priority
   */
  getByPriority(priority: TaskPriority): Task[] {
    return this.queue.filter((t) => t.priority === priority);
  }

  /**
   * Get tasks by agent
   */
  getByAgent(agentId: string): Task[] {
    const queued = this.queue.filter((t) => t.agentId === agentId);
    const processing = Array.from(this.processing.values()).filter(
      (t) => t.agentId === agentId
    );
    return [...processing, ...queued];
  }

  /**
   * Clear all tasks
   */
  clear(): void {
    this.queue = [];
    this.processing.clear();
  }

  /**
   * Prioritize a task (move to higher priority)
   */
  prioritize(taskId: string, newPriority: TaskPriority): boolean {
    const index = this.queue.findIndex((t) => t.id === taskId);
    if (index === -1) return false;

    const [task] = this.queue.splice(index, 1);
    task.priority = newPriority;

    const insertIndex = this.findInsertIndex(task);
    this.queue.splice(insertIndex, 0, task);

    return true;
  }

  /**
   * Register a handler for task execution
   */
  registerHandler(
    agentId: string,
    handler: (task: Task) => Promise<void>
  ): void {
    this.taskHandlers.set(agentId, handler);
  }

  /**
   * Unregister a handler
   */
  unregisterHandler(agentId: string): void {
    this.taskHandlers.delete(agentId);
  }

  /**
   * Process next available task for an agent
   */
  async processNext(agentId: string): Promise<Task | null> {
    const handler = this.taskHandlers.get(agentId);
    if (!handler) return null;

    const task = this.dequeueForAgent(agentId);
    if (!task) return null;

    try {
      await handler(task);
      return this.complete(task.id, {
        success: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.fail(task.id, message);
    }
  }
}
