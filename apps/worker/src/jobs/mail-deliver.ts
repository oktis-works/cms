// @oktis-works/worker - Mail delivery handler (Item 12)
//
// Processes the `mails` outbox: loads the QUEUED row, hands it to the
// configured transport (MAIL_TRANSPORT, default 'log' — no SMTP dependency)
// and marks SENT/FAILED via the core MailService.

import { mailService } from '@oktis-works/core';
import type { JobHandler, JobResult } from '../jobs/types.js';

export const mailDeliverHandler: JobHandler = async (job): Promise<JobResult> => {
  const { mailId } = job.payload as { mailId?: unknown };
  if (typeof mailId !== 'string' || mailId.length === 0) {
    return { success: false, error: 'mail.deliver payload inválido (esperado { mailId })' };
  }

  try {
    const delivered = await mailService.deliver(mailId);
    if (!delivered) {
      return { success: false, error: `mail ${mailId} não entregue (ausente, já processada ou falha de transporte)` };
    }
    return { success: true, data: { mailId } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};
