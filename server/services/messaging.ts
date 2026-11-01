import { DatabaseSchema, MessageRecord, MessageTemplate, MessageTemplateKind, Settings } from '../db.ts';
import crypto from 'crypto';

export interface SendMessageParams {
  customerId: string;
  kind: MessageRecord['kind'];
  data: {
    name?: string;
    link?: string;
    friend_points?: string | number;
    referrer_points?: string | number;
    earned_points?: string | number;
    points_balance?: string | number;
    amount?: string | number;
    expiry?: string;
    customBody?: string;
    shop?: string;
  };
}

export interface TemplateConfigDef {
  kind: MessageTemplateKind;
  title: string;
  description: string;
  requiredPlaceholders: string[];
  supportedPlaceholders: string[];
  defaultEn: string;
}

export const TEMPLATE_CONFIG: Record<MessageTemplateKind, TemplateConfigDef> = {
  welcome_no_code: {
    kind: 'welcome_no_code',
    title: 'Welcome — new customer, no code',
    description: 'Sent to a new customer after their first purchase when they did not use a referral code.',
    requiredPlaceholders: ['link'],
    supportedPlaceholders: ['shop', 'name', 'link', 'friend_points', 'referrer_points'],
    defaultEn: '{shop}: Thanks {name}! Your account and code: {link}. Every friend who uses your code gets {friend_points} points, and you get {referrer_points}.',
  },
  welcome_with_code: {
    kind: 'welcome_with_code',
    title: "Welcome — new customer who used a friend's code",
    description: "Sent to a new customer after their first purchase when they used a friend's referral code.",
    requiredPlaceholders: ['link'],
    supportedPlaceholders: ['shop', 'name', 'link', 'friend_points', 'referrer_points'],
    defaultEn: "{shop}: Thanks {name}! You've got {friend_points} welcome points. Your own code: {link}",
  },
  referral_return: {
    kind: 'referral_return',
    title: 'Referral return',
    description: 'Sent to Emma when her friend uses her code.',
    requiredPlaceholders: ['amount'],
    supportedPlaceholders: ['shop', 'name', 'link', 'amount', 'points_balance', 'expiry'],
    defaultEn: '{shop}: Your friend shopped with us! +{amount} points. You now have {points_balance} points: {link}',
  },
  credit_expiring: {
    kind: 'credit_expiring',
    title: 'Points expiring reminder',
    description: 'Sent to a customer when their points are about to expire.',
    requiredPlaceholders: ['amount', 'expiry'],
    supportedPlaceholders: ['shop', 'name', 'link', 'amount', 'expiry'],
    defaultEn: '{shop}: {amount} of your points expire on {expiry}. Visit us before then!',
  },
  points_earned: {
    kind: 'points_earned',
    title: 'Points earned after purchase',
    description: 'Sent to customers after each purchase when points_earned_text setting is enabled.',
    requiredPlaceholders: ['earned_points', 'points_balance'],
    supportedPlaceholders: ['shop', 'name', 'earned_points', 'points_balance', 'link'],
    defaultEn: '{shop}: You earned {earned_points} points today. Balance: {points_balance}.',
  },
  offer_footer: {
    kind: 'offer_footer',
    title: 'Offer footer',
    description: 'The opt-out line appended to the end of every marketing offer broadcast.',
    requiredPlaceholders: ['link'],
    supportedPlaceholders: ['shop', 'link'],
    defaultEn: ' Reply STOP or use {link} to stop offers.',
  },
};

export function validateTemplate(kind: MessageTemplateKind, body: string): { valid: boolean; error?: string } {
  if (!body || !body.trim()) {
    return { valid: false, error: 'Template text cannot be empty.' };
  }

  const config = TEMPLATE_CONFIG[kind];
  if (!config) {
    return { valid: false, error: `Invalid template kind: ${kind}.` };
  }

  const matches = body.match(/\{([a-zA-Z0-9_]+)\}/g) || [];
  const foundPlaceholders = matches.map((m) => m.slice(1, -1));

  for (const ph of foundPlaceholders) {
    if (!config.supportedPlaceholders.includes(ph)) {
      return {
        valid: false,
        error: `Unknown or unsupported placeholder '{${ph}}' for ${config.title}. Supported placeholders: ${config.supportedPlaceholders.map((p) => `{${p}}`).join(', ')}`,
      };
    }
  }

  for (const reqPh of config.requiredPlaceholders) {
    if (!foundPlaceholders.includes(reqPh)) {
      return {
        valid: false,
        error: `Required placeholder '{${reqPh}}' is missing from ${config.title}.`,
      };
    }
  }

  return { valid: true };
}

export function renderTemplateText(
  templateText: string,
  data: Record<string, string | undefined>
): string {
  return templateText.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    return data[key] !== undefined ? String(data[key]) : match;
  });
}

export class MessagingService {
  public getTemplate(
    database: DatabaseSchema | undefined,
    kind: MessageTemplateKind
  ): string {
    const config = TEMPLATE_CONFIG[kind];
    if (database && database.message_templates) {
      const stored = database.message_templates.find((t) => t.kind === kind);
      if (stored && stored.body && stored.body.trim()) {
        if (/\{(friend_discount|referrer_reward|b_reward|a_amount|credit)\}/.test(stored.body)) {
          return config.defaultEn;
        }
        return stored.body;
      }
    }
    return config.defaultEn;
  }

  private buildMessageBody(
    database: DatabaseSchema,
    kind: MessageRecord['kind'],
    settings: Settings,
    data: SendMessageParams['data']
  ): string {
    const shop = data.shop || settings.shop_name || 'Your Business';

    if (kind === 'offer') {
      const base = (data.customBody || '').trim();
      const footerTpl = this.getTemplate(database, 'offer_footer');
      const footer = renderTemplateText(footerTpl, { shop, link: data.link || '' });
      return `${base}${footer.startsWith(' ') ? '' : ' '}${footer.trim()}`.trim();
    }

    let templateKind: MessageTemplateKind;
    if (kind === 'welcome_with_code') {
      templateKind = 'welcome_with_code';
    } else if (kind === 'welcome_no_code' || kind === 'welcome') {
      templateKind = 'welcome_no_code';
    } else if (kind === 'referral_return') {
      templateKind = 'referral_return';
    } else if (kind === 'credit_expiring') {
      templateKind = 'credit_expiring';
    } else if (kind === 'points_earned') {
      templateKind = 'points_earned';
    } else {
      templateKind = 'welcome_no_code';
    }

    const tpl = this.getTemplate(database, templateKind);

    const values: Record<string, string | undefined> = {
      shop,
      name: data.name || 'valued customer',
      link: data.link || '',
      friend_points: data.friend_points !== undefined ? String(data.friend_points) : String(settings.friend_points || 100),
      referrer_points: data.referrer_points !== undefined ? String(data.referrer_points) : String(settings.referrer_points || 100),
      earned_points: data.earned_points !== undefined ? String(data.earned_points) : '',
      points_balance: data.points_balance !== undefined ? String(data.points_balance) : '',
      amount: data.amount !== undefined ? String(data.amount) : '',
      expiry: data.expiry || '',
    };

    return renderTemplateText(tpl, values);
  }

  public send(database: DatabaseSchema, params: SendMessageParams): MessageRecord {
    const settings = database.settings;
    const body = this.buildMessageBody(database, params.kind, settings, params.data);

    const channelEnv = process.env.MESSAGING_PROVIDER || 'dev';
    const channel = channelEnv === 'sms' ? 'sms' : channelEnv === 'whatsapp' ? 'whatsapp' : 'dev';

    const record: MessageRecord = {
      id: crypto.randomUUID(),
      customer_id: params.customerId,
      kind: params.kind,
      channel,
      body,
      status: 'sent',
      error: null,
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    database.messages.unshift(record);
    if (channel === 'dev') {
      console.log(`[Messaging - DEV] -> Customer ${params.customerId} [${params.kind}]: ${body}`);
    }
    return record;
  }

  public retry(database: DatabaseSchema, messageId: string): MessageRecord {
    const msg = database.messages.find((m) => m.id === messageId);
    if (!msg) {
      throw new Error('Message not found');
    }
    msg.status = 'sent';
    msg.error = null;
    msg.sent_at = new Date().toISOString();
    return { ...msg };
  }
}

export const messagingService = new MessagingService();
