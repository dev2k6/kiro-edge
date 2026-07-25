export interface Account {
  id: string;
  email?: string;
  userId?: string;
  nickname?: string;

  // Custom API fields
  baseUrl?: string;
  orderId?: string;
  tags?: string[];

  // Authentication credentials
  accessToken: string;
  refreshToken: string;
  clientId?: string;
  clientSecret?: string;
  kiroApiKey?: string;
  authMethod: string; // "idc", "social", "external_idp", "api_key", "custom_api", "bedrock"
  provider?: string;
  region?: string;
  startUrl?: string;
  expiresAt?: number;
  machineId?: string;
  profileArn?: string;

  // External IdP
  tokenEndpoint?: string;
  issuerUrl?: string;
  scopes?: string;

  // Bedrock
  bedrockAccessKeyId?: string;
  bedrockSecretAccessKey?: string;
  bedrockSessionToken?: string;
  bedrockApiKey?: string;
  bedrockRegions?: string[];
  bedrockModelMap?: Record<string, string>;
  bedrockUseConverse?: boolean;

  proxyURL?: string;
  weight?: number;

  // Overage
  overageStatus?: string;
  overageCapability?: string;
  overageCap?: number;
  overageRate?: number;
  currentOverages?: number;
  overageCheckedAt?: number;

  // Status
  enabled: boolean;
  banStatus?: string;
  banReason?: string;
  banTime?: number;

  // Usage tracking
  usageCurrent?: number;
  usageLimit?: number;
  usagePercent?: number;
  nextResetDate?: string;
  lastRefresh?: number;

  // Runtime stats
  requestCount?: number;
  errorCount?: number;
  lastUsed?: number;
  totalTokens?: number;
  totalCredits?: number;
}

export interface Env {
  KIRO_KV?: any; // Use any for KVNamespace if types are not global
  ACCOUNTS_JSON?: string; 
}
