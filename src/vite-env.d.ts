/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 扶摇金融数据 API Key（真实数据接入预留，未配置时使用演示数据快照） */
  readonly VITE_FUYAO_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}