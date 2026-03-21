import React, { useEffect, useState } from 'react';
import Modal from '../os/Modal';
import { ActiveMsg2DbDriver, ActiveMsg2GlobalConfig } from '../../types';
import { ActiveMsgClient } from '../../utils/activeMsgClient';
import { ActiveMsgStore, maskActiveMsgUserId } from '../../utils/activeMsgStore';

interface ActiveMsgGlobalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ActiveMsgGlobalSettingsModal: React.FC<ActiveMsgGlobalSettingsModalProps> = ({
  isOpen,
  onClose,
  addToast,
}) => {
  const [config, setConfig] = useState<ActiveMsg2GlobalConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState<{
    supported: boolean;
    permission: NotificationPermission | 'unsupported';
    hasSubscription: boolean;
    vapidConfigured: boolean;
    detail?: string;
  } | null>(null);
  const [keyStatus, setKeyStatus] = useState<string>('');

  const refresh = async () => {
    const nextConfig = await ActiveMsgClient.getGlobalConfig();
    const nextPushStatus = await ActiveMsgClient.getPushStatus();
    setConfig(nextConfig);
    setPushStatus(nextPushStatus);
  };

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !config) return;
    void ActiveMsgStore.saveGlobalConfig({
      driver: config.driver,
      databaseUrl: config.databaseUrl,
      initSecret: config.initSecret,
    });
  }, [config?.driver, config?.databaseUrl, config?.initSecret, isOpen]);

  const patchConfig = (updates: Partial<ActiveMsg2GlobalConfig>) => {
    setConfig((prev) => ({ ...(prev || { userId: '', driver: 'pg', databaseUrl: '' }), ...updates }));
  };

  const handleCreateSubscription = async () => {
    setLoading(true);
    try {
      await ActiveMsgClient.ensurePushSubscription();
      await refresh();
      addToast('通知权限和推送订阅已准备完成。', 'success');
    } catch (error: any) {
      addToast(error?.message || '创建推送订阅失败。', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleInitTenant = async () => {
    if (!config?.databaseUrl.trim()) {
      addToast('请先填写 Database URL。', 'error');
      return;
    }

    setLoading(true);
    try {
      await ActiveMsgClient.initTenant({
        driver: config.driver,
        databaseUrl: config.databaseUrl,
        initSecret: config.initSecret,
      });
      await refresh();
      addToast('主动消息 2.0 租户初始化完成。', 'success');
    } catch (error: any) {
      addToast(error?.message || '初始化租户失败。', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGetUserKey = async () => {
    setLoading(true);
    try {
      const result = await ActiveMsgClient.verifyUserKey();
      setKeyStatus(`已通过 SDK 获取用户密钥，版本 v${result.version}。`);
      addToast('用户密钥获取成功。', 'success');
    } catch (error: any) {
      setKeyStatus(error?.message || '获取用户密钥失败。');
      addToast(error?.message || '获取用户密钥失败。', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!config) return null;

  return (
    <Modal
      isOpen={isOpen}
      title="主动消息 2.0"
      onClose={onClose}
      footer={(
        <>
          <button onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-500 font-bold rounded-2xl active:scale-95 transition-transform">
            关闭
          </button>
        </>
      )}
    >
      <div className="space-y-4 text-sm text-slate-600">
        <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-slate-700">X-User-Id</span>
            <span className="text-xs font-mono text-violet-600">{maskActiveMsgUserId(config.userId)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-slate-700">API Base</span>
            <span className="text-[10px] font-mono text-violet-600 break-all text-right">{ActiveMsgClient.apiBaseUrl}</span>
          </div>
          <div className="text-[11px] leading-relaxed text-violet-600/80">
            濡傛灉鍓嶇鏄斁鍦?GitHub Pages锛岃€?2.0 鍑芥暟鏄儴缃插湪 Netlify锛岄渶瑕佸湪鏋勫缓鐜璁剧疆 <code>VITE_AMSG_API_BASE_URL</code> 鎸囧悜 Netlify 绔欑偣銆?
          </div>
          <p className="text-[11px] leading-relaxed text-violet-600/80">
            首次进入会自动生成 UUID v4 并写入独立的 IndexedDB: <code>ActiveMsg</code>。
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-700">推送状态</span>
            <span className={`text-xs font-bold ${pushStatus?.hasSubscription ? 'text-emerald-600' : 'text-amber-600'}`}>
              {pushStatus?.hasSubscription ? '已订阅' : '未订阅'}
            </span>
          </div>
          <div className="text-xs space-y-1 text-slate-500">
            <div>权限：{pushStatus?.permission || 'unknown'}</div>
            <div>VAPID：{pushStatus?.vapidConfigured ? '已配置' : '缺少 VITE_AMSG_VAPID_PUBLIC_KEY'}</div>
            {pushStatus?.detail ? <div>{pushStatus.detail}</div> : null}
          </div>
          <button
            onClick={handleCreateSubscription}
            disabled={loading}
            className="w-full py-3 bg-violet-500 text-white font-bold rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
          >
            {loading ? '处理中...' : '请求通知权限并创建 Push Subscription'}
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">Driver</label>
            <div className="grid grid-cols-2 gap-2">
              {(['pg', 'neon'] as ActiveMsg2DbDriver[]).map((driver) => (
                <button
                  key={driver}
                  onClick={() => patchConfig({ driver })}
                  className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${config.driver === driver ? 'bg-violet-500 text-white border-violet-500' : 'bg-white border-slate-200 text-slate-600'}`}
                >
                  {driver}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">Database URL</label>
            <textarea
              value={config.databaseUrl}
              onChange={(event) => patchConfig({ databaseUrl: event.target.value })}
              placeholder="postgres://... 或 neon 连接串"
              className="w-full h-24 bg-white/70 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-mono resize-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">Init Secret (可选)</label>
            <input
              type="password"
              value={config.initSecret || ''}
              onChange={(event) => patchConfig({ initSecret: event.target.value })}
              placeholder="若服务端要求 x-init-secret，在这里填"
              className="w-full bg-white/70 border border-slate-200 rounded-2xl px-4 py-3 text-sm"
            />
          </div>

          <button
            onClick={handleInitTenant}
            disabled={loading}
            className="w-full py-3 bg-slate-900 text-white font-bold rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
          >
            {loading ? '处理中...' : '初始化租户 (POST /api/v1/init-tenant)'}
          </button>

          <button
            onClick={handleGetUserKey}
            disabled={loading || !config.tenantToken}
            className="w-full py-3 bg-emerald-500 text-white font-bold rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
          >
            {loading ? '处理中...' : '获取用户密钥 (GET /api/v1/get-user-key)'}
          </button>
          {keyStatus ? <p className="text-xs text-emerald-600 leading-relaxed">{keyStatus}</p> : null}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="font-bold text-slate-700">初始化结果</div>
          <div className="space-y-2 text-xs">
            <div>
              <div className="font-semibold text-slate-500 mb-1">tenantId</div>
              <div className="font-mono break-all">{config.tenantId || '未初始化'}</div>
            </div>
            <div>
              <div className="font-semibold text-slate-500 mb-1">tenantToken</div>
              <textarea readOnly value={config.tenantToken || ''} className="w-full h-16 bg-slate-50 rounded-xl px-3 py-2 font-mono resize-none" />
            </div>
            <div>
              <div className="font-semibold text-slate-500 mb-1">cronToken</div>
              <textarea readOnly value={config.cronToken || ''} className="w-full h-16 bg-slate-50 rounded-xl px-3 py-2 font-mono resize-none" />
            </div>
            <div>
              <div className="font-semibold text-slate-500 mb-1">cronWebhookUrl</div>
              <textarea readOnly value={config.cronWebhookUrl || ''} className="w-full h-16 bg-slate-50 rounded-xl px-3 py-2 font-mono resize-none" />
            </div>
            <div>
              <div className="font-semibold text-slate-500 mb-1">masterKeyFingerprint</div>
              <div className="font-mono break-all">{config.masterKeyFingerprint || '未生成'}</div>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-[11px] leading-relaxed text-amber-700 space-y-2">
          <div className="font-bold text-amber-800">风险说明</div>
          <p>请知悉数据库管理员可以随时获取你上传的主动消息内容、提示词、API 密钥等全部信息。</p>
          <p>除数据库管理员外，项目管理员在该信任模型下理论上也可获取解密能力，这是已接受边界。</p>
          <p>若介意，请使用自己的数据库，除非你完全信任提供数据库的管理员，或愿意承担风险。</p>
          <p>在数据库密码和本地密钥未泄漏的情况下，只有你和管理员可以查看数据。密钥和你所有的聊天记录一同存放。</p>
          <p>该项目不会引入超出当前信任模型的新风险。</p>
        </div>
      </div>
    </Modal>
  );
};

export default React.memo(ActiveMsgGlobalSettingsModal);
