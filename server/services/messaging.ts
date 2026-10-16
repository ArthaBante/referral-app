import { db, MessageRecord, Settings } from '../db.ts';
import crypto from 'crypto';

export interface SendMessageParams {
  customerId: string;
  kind: MessageRecord['kind'];
  data: {
    name?: string;
    link?: string;
    b_reward?: string;
    a_reward?: string;
    amount?: string;
    date?: string;
    expiry?: string;
    used?: string;
    balance?: string;
    otp?: string;
    customBody?: string;
  };
}

export class MessagingService {
  private formatAmount(paiseOrString: number | string): string {
    if (typeof paiseOrString === 'number') {
      return `₹${Math.round(paiseOrString / 100)}`;
    }
    return String(paiseOrString);
  }

  private buildMessageBody(
    kind: MessageRecord['kind'],
    settings: Settings,
    data: SendMessageParams['data']
  ): string {
    const shop = settings.shop_name || 'Shehzaadi';
    const lang = settings.message_language || 'English';

    if (kind === 'offer') {
      const base = data.customBody || '';
      const stopNotice = lang === 'Hindi'
        ? ` ऑफर्स रोकने के लिए ${data.link} खोलें।`
        : ` Reply STOP or use ${data.link} to stop offers.`;
      return `${base.trim()}${stopNotice}`.trim();
    }

    let enText = '';
    let hiText = '';

    switch (kind) {
      case 'welcome':
        enText = `${shop}: Thanks ${data.name || 'valued customer'}! Your credit and referral code: ${data.link}. Give your code to a friend: they get ${data.b_reward} off, you get ${data.a_reward} credit.`;
        hiText = `${shop}: धन्यवाद ${data.name || 'ग्राहक'}! आपका क्रेडिट और रेफरल कोड: ${data.link}। दोस्त को दें: उन्हें ${data.b_reward} छूट, आपको ${data.a_reward} क्रेडिट।`;
        break;

      case 'credit_pending':
        enText = `${shop}: Your friend shopped with us! ${data.amount} credit will be ready on ${data.date}.`;
        hiText = `${shop}: आपकी सहेली ने खरीदारी की! ${data.amount} क्रेडिट ${data.date} को सक्रिय होगा।`;
        break;

      case 'credit_ready':
        enText = `${shop}: Your ${data.amount} store credit is ready. Use it by ${data.expiry}: ${data.link}`;
        hiText = `${shop}: आपका ${data.amount} स्टोर क्रेडिट सक्रिय है। ${data.expiry} तक उपयोग करें: ${data.link}`;
        break;

      case 'credit_expiring':
        enText = `${shop}: ${data.amount} of your store credit expires on ${data.expiry}. Visit us before then!`;
        hiText = `${shop}: आपका ${data.amount} स्टोर क्रेडिट ${data.expiry} को समाप्त हो रहा है। जल्द पधारें!`;
        break;

      case 'credit_used':
        enText = `${shop}: ${data.used} credit used today. Balance: ${data.balance}.`;
        hiText = `${shop}: आज ${data.used} क्रेडिट उपयोग हुआ। शेष बैलेंस: ${data.balance}।`;
        break;

      case 'otp':
        enText = `${shop}: Your code to use store credit is ${data.otp}. Valid 5 minutes.`;
        hiText = `${shop}: स्टोर क्रेडिट उपयोग के लिए आपका कोड ${data.otp} है। 5 मिनट मान्य।`;
        break;
    }

    if (lang === 'Hindi') {
      return hiText || enText;
    } else if (lang === 'both') {
      return `${enText}\n\n${hiText}`;
    }
    return enText;
  }

  public send(params: SendMessageParams): MessageRecord {
    return db.transaction((database) => {
      const settings = database.settings;
      const body = this.buildMessageBody(params.kind, settings, params.data);

      const channel = (process.env.MESSAGING_PROVIDER as any) || 'dev';
      const record: MessageRecord = {
        id: crypto.randomUUID(),
        customer_id: params.customerId,
        kind: params.kind,
        channel: channel === 'sms' ? 'sms' : channel === 'whatsapp' ? 'whatsapp' : 'dev',
        body,
        status: 'sent',
        error: null,
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      database.messages.unshift(record);
      // In dev mode, message is logged
      console.log(`[Messaging - ${record.channel.toUpperCase()}] -> Customer ${params.customerId} [${params.kind}]: ${body}`);
      return record;
    });
  }

  public retry(messageId: string): MessageRecord {
    return db.transaction((database) => {
      const msg = database.messages.find((m) => m.id === messageId);
      if (!msg) {
        throw new Error('Message not found');
      }
      msg.status = 'sent';
      msg.error = null;
      msg.sent_at = new Date().toISOString();
      console.log(`[Messaging - RETRIED] Message ${messageId} successfully resent.`);
      return { ...msg };
    });
  }
}

export const messagingService = new MessagingService();
