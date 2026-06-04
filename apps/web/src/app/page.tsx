'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  Activity,
  TrendingUp,
  Zap,
  Clock,
  ChevronRight,
  Wallet,
  BarChart3,
  Eye,
  ArrowRightLeft,
  Sun,
  Moon,
  Play,
  RefreshCw,
  Globe2,
  Trash2,
} from 'lucide-react';

const LOGO_URL = 'https://raw.createusercontent.com/ef83fbea-b45f-4d4d-8f71-c23d5eb0a565/';
const TABS = ['Overview', 'Risk Log', 'Assets'];
const THEME_STORAGE_KEY = 'risk-whisperer-theme';
const OWNER_STORAGE_KEY = 'risk-whisperer-owner-key';
const WALLET_CONNECTED_STORAGE_KEY = 'risk-whisperer-wallet-connected';
const MANTLE_CHAIN_ID = '0x1388';
const MANTLE_CHAIN_PARAMS = {
  chainId: MANTLE_CHAIN_ID,
  chainName: 'Mantle',
  nativeCurrency: {
    name: 'Mantle',
    symbol: 'MNT',
    decimals: 18,
  },
  rpcUrls: ['https://rpc.mantle.xyz'],
  blockExplorerUrls: ['https://mantlescan.xyz'],
};
const MANTLE_TOKENS = {
  mETH: {
    address: '0xcDA86A272531e8640cD7F1a92c01839911B90bb0',
    name: 'Mantle Staked Ether',
  },
  USDY: {
    address: '0x5bE26527e817998A7206475496fDE1E68957c5A6',
    name: 'Ondo US Dollar Yield',
  },
} as const;
const ERC20_BALANCE_OF = '0x70a08231';
const ERC20_DECIMALS = '0x313ce567';

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  providers?: EthereumProvider[];
  isMetaMask?: boolean;
  isRabby?: boolean;
};

type WalletOption = {
  id: string;
  name: string;
  iconUrl?: string;
  provider?: EthereumProvider;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

// Pure ISO string formatters â€” no new Date() so no hydration mismatch
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso: string): string {
  const [datePart, timePart = ''] = iso.split('T');
  const parts = datePart.split('-');
  const year = parts[0] ?? '';
  const month = parseInt(parts[1] ?? '1', 10);
  const day = parseInt(parts[2] ?? '1', 10);
  const timeParts = timePart.split(':');
  const hour = parseInt(timeParts[0] ?? '0', 10);
  const minute = timeParts[1] ?? '00';
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${MONTHS[month - 1]} ${day}, ${year}, ${hour12}:${minute} ${ampm}`;
}

function fmtTime(iso: string): string {
  const timePart = iso.split('T')[1] ?? '';
  const timeParts = timePart.split(':');
  const hour = parseInt(timeParts[0] ?? '0', 10);
  const minute = timeParts[1] ?? '00';
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${ampm}`;
}

function fmtCurrency(value: number | null | undefined, maxDecimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'â€”';
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: maxDecimals })}`;
}

function fmtPercent(value: number | null | undefined, maxDecimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'â€”';
  return `${value >= 0 ? '+' : ''}${value.toLocaleString(undefined, {
    maximumFractionDigits: maxDecimals,
  })}%`;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getVisitorOwnerKey(): string {
  const saved = window.localStorage.getItem(OWNER_STORAGE_KEY);
  if (saved) return saved;

  const randomId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ownerKey = `anon:${randomId}`;
  window.localStorage.setItem(OWNER_STORAGE_KEY, ownerKey);
  return ownerKey;
}

function encodeBalanceOf(address: string): string {
  return `${ERC20_BALANCE_OF}${address.toLowerCase().replace('0x', '').padStart(64, '0')}`;
}

function formatTokenAmount(raw: bigint, decimals: number, maxDecimals = 4): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = raw % base;

  if (fraction === 0n || maxDecimals === 0) return whole.toString();

  const paddedFraction = fraction.toString().padStart(decimals, '0');
  const trimmedFraction = paddedFraction.slice(0, maxDecimals).replace(/0+$/, '');

  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole.toString();
}

async function ethCall(ethereum: EthereumProvider, to: string, data: string): Promise<string> {
  return ethereum.request({
    method: 'eth_call',
    params: [{ to, data }, 'latest'],
  }) as Promise<string>;
}

async function readTokenBalance(
  ethereum: EthereumProvider,
  symbol: TokenSymbol,
  walletAddress: string
): Promise<WalletTokenBalance> {
  const token = MANTLE_TOKENS[symbol];
  const [decimalsHex, balanceHex] = await Promise.all([
    ethCall(ethereum, token.address, ERC20_DECIMALS),
    ethCall(ethereum, token.address, encodeBalanceOf(walletAddress)),
  ]);
  const decimals = Number(BigInt(decimalsHex));
  const rawBalance = BigInt(balanceHex);

  return {
    symbol,
    address: token.address,
    decimals,
    rawBalance: rawBalance.toString(),
    balance: formatTokenAmount(rawBalance, decimals),
  };
}

function WalletLogo({ id }: { id: string }) {
  if (id === 'metamask') {
    return (
      <img src="/wallets/metamask.svg" alt="" className="w-7 h-7 object-contain" />
    );
  }

  if (id === 'rabby') {
    return (
      <img src="/wallets/rabby.svg" alt="" className="w-7 h-7 object-contain" />
    );
  }

  return <Globe2 size={20} className="text-green-400" />;
}

function getWalletOptions(): WalletOption[] {
  if (typeof window === 'undefined' || !window.ethereum) {
    return [
      { id: 'metamask', name: 'MetaMask', iconUrl: '/wallets/metamask.svg' },
      { id: 'rabby', name: 'Rabby Wallet', iconUrl: '/wallets/rabby.svg' },
      { id: 'injected', name: 'Injected' },
    ];
  }

  const providers = window.ethereum.providers ?? [window.ethereum];
  const metamask = providers.find((provider) => provider.isMetaMask && !provider.isRabby);
  const rabby = providers.find((provider) => provider.isRabby);
  const injected = window.ethereum;

  return [
    { id: 'metamask', name: 'MetaMask', iconUrl: '/wallets/metamask.svg', provider: metamask },
    { id: 'rabby', name: 'Rabby Wallet', iconUrl: '/wallets/rabby.svg', provider: rabby },
    { id: 'injected', name: 'Injected', provider: injected },
  ];
}

interface Decision {
  id: number;
  tx_hash: string;
  trigger_type: string;
  reasoning: string;
  action: string;
  from_asset: string;
  to_asset: string;
  amount: string;
  risk_before: number;
  risk_after: number;
  confidence: number;
  status: string;
  market_snapshot?: DecisionSnapshot;
  created_at: string;
}

type DecisionSnapshot = {
  market?: MarketData;
  research?: {
    generatedAt?: string;
    objective?: string;
    sources?: ResearchSource[];
    riskHypotheses?: string[];
    opportunityHypotheses?: string[];
  };
  ai?: {
    research_brief?: string;
    key_findings?: string[];
    sources_used?: string[];
  };
};

type ResearchSource = {
  label: string;
  category: string;
  url: string;
  summary: string;
  signal: string;
};

interface Portfolio {
  meth_allocation: number;
  usdy_allocation: number;
  total_value_usd: number;
}

interface MarketData {
  ethPrice: number | null;
  ethChange: number | null;
  methPrice: number | null;
  methChange: number | null;
  usdyPrice: number | null;
  usdyChange: number | null;
  usdyPegDeviation: number | null;
  mantleTvlChange: number | null;
  sentimentScore: number | null;
  sentimentLabel: string | null;
  fundingRate: number | null;
  fetchedAt: string;
}

type TokenSymbol = keyof typeof MANTLE_TOKENS;

type WalletTokenBalance = {
  symbol: TokenSymbol;
  address: string;
  balance: string;
  rawBalance: string;
  decimals: number;
};

type WalletBalances = Record<TokenSymbol, WalletTokenBalance>;

function RingChart({
  value,
  color = '#EA580C',
  size = 80,
  dark = false,
}: {
  value: number;
  color?: string;
  size?: number;
  dark?: boolean;
}) {
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={dark ? '#374151' : '#F3F4F6'}
        strokeWidth={6}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatusPill({ status, dark }: { status: string; dark: boolean }) {
  const displayStatus = status === 'Executed' ? 'Recommended' : status;
  const dot =
    displayStatus === 'Recommended'
      ? 'bg-green-500'
      : displayStatus === 'Skipped'
        ? 'bg-gray-400'
        : 'bg-yellow-500';
  return (
    <span
      className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-xs ${dark ? 'bg-[#262626] border-gray-700 text-gray-300' : 'bg-white border-gray-200 text-gray-700'}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} /> {displayStatus}
    </span>
  );
}

function ActionPill({ action, dark }: { action: string; dark: boolean }) {
  const light: Record<string, string> = {
    Reallocate: 'bg-blue-50 text-blue-600',
    Reduce: 'bg-red-50 text-red-600',
    Increase: 'bg-green-50 text-green-600',
    Hold: 'bg-gray-100 text-gray-500',
  };
  const dk: Record<string, string> = {
    Reallocate: 'bg-blue-950 text-blue-400',
    Reduce: 'bg-red-950 text-red-400',
    Increase: 'bg-green-950 text-green-400',
    Hold: 'bg-gray-800 text-gray-400',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${(dark ? dk : light)[action] ?? 'bg-gray-100 text-gray-500'}`}
    >
      {action}
    </span>
  );
}

function TriggerPill({ trigger, dark }: { trigger: string; dark: boolean }) {
  return (
    <span
      className={`border rounded-full px-3 py-1 text-xs inline-flex items-center gap-1.5 ${dark ? 'bg-[#262626] border-gray-700 text-gray-300' : 'bg-white border-gray-200 text-gray-700'}`}
    >
      {trigger === 'News Signal' && <Zap size={10} className="text-blue-500" />}
      {trigger === 'On-chain Anomaly' && <Activity size={10} className="text-orange-500" />}
      {trigger === 'Market Scan' && <BarChart3 size={10} className="text-purple-500" />}
      {trigger === 'Sentiment Alert' && <Eye size={10} className="text-gray-500" />}
      {trigger}
    </span>
  );
}

export default function RiskWhisperer() {
  const [activeTab, setActiveTab] = useState('Overview');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [connectedWalletProvider, setConnectedWalletProvider] = useState<EthereumProvider | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [walletOptions, setWalletOptions] = useState<WalletOption[]>([]);
  const [ownerKey, setOwnerKey] = useState('');
  const [todayStr, setTodayStr] = useState('');
  const qc = useQueryClient();

  useEffect(() => {
    setTodayStr(new Date().toISOString().slice(0, 10));
    setOwnerKey(getVisitorOwnerKey());

    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === 'dark') setDark(true);
    if (savedTheme === 'light') setDark(false);
    const options = getWalletOptions();
    setWalletOptions(options);

    if (window.localStorage.getItem(WALLET_CONNECTED_STORAGE_KEY) === 'true') {
      void Promise.all(
        options.map(async (option) => {
          if (!option.provider) return null;
          const accounts = (await option.provider.request({ method: 'eth_accounts' })) as string[];
          const account = accounts[0];
          return account ? { account, provider: option.provider } : null;
        })
      )
        .then((matches) => {
          const restored = matches.find(Boolean);
          if (!restored) return;
          setWalletAddress(restored.account);
          setConnectedWalletProvider(restored.provider);
        })
        .catch(() => undefined);
    }
  }, []);

  function toggleTheme() {
    setDark((current) => {
      const next = !current;
      window.localStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light');
      return next;
    });
  }

  useEffect(() => {
    if (!connectedWalletProvider) return;
    const handleAccountsChanged = (...args: unknown[]) => {
      const [accounts] = args as [string[]];
      setWalletAddress(accounts?.[0] ?? '');
    };

    connectedWalletProvider.on?.('accountsChanged', handleAccountsChanged);
    return () => connectedWalletProvider.removeListener?.('accountsChanged', handleAccountsChanged);
  }, [connectedWalletProvider]);

  const bg = dark ? 'bg-[#121212]' : 'bg-[#F9FAFB]';
  const card = dark ? 'bg-[#1E1E1E] border-gray-800' : 'bg-white border-gray-200';
  const navBg = dark ? 'bg-[#1E1E1E] border-gray-800' : 'bg-white border-gray-200';
  const heading = dark ? 'text-gray-100' : 'text-gray-900';
  const sub = dark ? 'text-gray-400' : 'text-gray-500';
  const pillBg = dark
    ? 'bg-[#262626] border-gray-700 text-gray-300'
    : 'bg-white border-gray-200 text-gray-700';
  const tabActive = dark ? 'text-gray-100 border-blue-500' : 'text-gray-900 border-blue-600';
  const tabInactive = dark
    ? 'text-gray-400 border-transparent hover:text-gray-200'
    : 'text-gray-500 border-transparent hover:text-gray-700';
  const divider = dark ? 'border-gray-800' : 'border-gray-200';
  const innerDivider = dark ? 'border-gray-800' : 'border-gray-100';
  const barBg = dark ? 'bg-gray-800' : 'bg-gray-100';
  const signalCard = dark ? 'border-gray-700' : 'border-gray-200';

  async function switchToMantle(ethereum: EthereumProvider) {
    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: MANTLE_CHAIN_ID }],
      });
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code !== 4902) throw err;
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [MANTLE_CHAIN_PARAMS],
      });
    }
  }

  async function connectWallet(option: WalletOption) {
    setWalletError(null);
    const ethereum = option.provider;
    if (!ethereum) {
      setWalletError(`Install or unlock ${option.name} to connect.`);
      return;
    }

    try {
      const accounts = (await ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      setWalletAddress(accounts[0] ?? '');
      setConnectedWalletProvider(ethereum);
      window.localStorage.setItem(WALLET_CONNECTED_STORAGE_KEY, 'true');
      await switchToMantle(ethereum);
      qc.invalidateQueries({ queryKey: ['wallet-balances'] });
      setWalletMenuOpen(false);
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Wallet connection failed');
    }
  }

  async function copyWalletAddress() {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setWalletError('Address copied');
    setWalletMenuOpen(false);
  }

  function disconnectWallet() {
    setWalletAddress('');
    setConnectedWalletProvider(null);
    window.localStorage.removeItem(WALLET_CONNECTED_STORAGE_KEY);
    setWalletError(null);
    setWalletMenuOpen(false);
    qc.invalidateQueries({ queryKey: ['wallet-balances'] });
  }

  const { data: decisionsData, isLoading: decisionsLoading } = useQuery({
    queryKey: ['decisions', ownerKey],
    enabled: Boolean(ownerKey),
    queryFn: async () => {
      const res = await fetch('/api/decisions', {
        headers: { 'x-risk-owner-key': ownerKey },
      });
      if (!res.ok) throw new Error('Failed to fetch decisions');
      return res.json() as Promise<{ decisions: Decision[]; portfolio: Portfolio }>;
    },
    refetchInterval: 30_000,
  });

  const { data: market, isLoading: marketLoading } = useQuery({
    queryKey: ['market'],
    queryFn: async () => {
      const res = await fetch('/api/market-data');
      if (!res.ok) throw new Error('Failed to fetch market data');
      return res.json() as Promise<MarketData>;
    },
    refetchInterval: 60_000,
  });

  const {
    data: walletBalances,
    isLoading: walletBalancesLoading,
    error: walletBalancesError,
  } = useQuery({
    queryKey: ['wallet-balances', walletAddress],
    enabled: Boolean(walletAddress && connectedWalletProvider),
    retry: false,
    queryFn: async () => {
      const ethereum = connectedWalletProvider;
      if (!ethereum) throw new Error('No wallet provider found');

      const chainId = (await ethereum.request({ method: 'eth_chainId' })) as string;
      if (chainId.toLowerCase() !== MANTLE_CHAIN_ID) {
        throw new Error('Switch your wallet to Mantle Mainnet to read USDY and mETH balances.');
      }

      const [meth, usdy] = await Promise.all([
        readTokenBalance(ethereum, 'mETH', walletAddress),
        readTokenBalance(ethereum, 'USDY', walletAddress),
      ]);

      return {
        mETH: meth,
        USDY: usdy,
      } satisfies WalletBalances;
    },
    refetchInterval: 30_000,
  });

  const { mutate: runAgent, isPending: agentRunning } = useMutation({
    mutationFn: async () => {
      setAgentError(null);
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'x-risk-owner-key': ownerKey },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Agent run failed');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['decisions', ownerKey] });
      qc.invalidateQueries({ queryKey: ['market'] });
    },
    onError: (err: Error) => setAgentError(err.message),
  });

  const { mutate: deleteDecision, isPending: decisionDeleting, variables: deletingDecisionId } =
    useMutation({
      mutationFn: async (id: number) => {
        const res = await fetch(`/api/decisions?id=${id}`, {
          method: 'DELETE',
          headers: { 'x-risk-owner-key': ownerKey },
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? 'Failed to delete decision');
        }
        return res.json();
      },
      onSuccess: (_data, id) => {
        if (expandedLog === String(id)) setExpandedLog(null);
        qc.invalidateQueries({ queryKey: ['decisions', ownerKey] });
      },
      onError: (err: Error) => setAgentError(err.message),
    });

  function requestDeleteDecision(id: number) {
    const confirmed = window.confirm(
      'Delete this AI decision from the saved log? This cannot be undone.'
    );
    if (confirmed) deleteDecision(id);
  }

  const decisions: Decision[] = decisionsData?.decisions ?? [];
  const portfolio: Portfolio = decisionsData?.portfolio ?? {
    meth_allocation: 0,
    usdy_allocation: 0,
    total_value_usd: 0,
  };
  const latestRisk = decisions[0]?.risk_after;
  const prevRisk = decisions[1]?.risk_after;
  const recommendedToday = decisions.filter(
    (d) =>
      (d.status === 'Recommended' || d.status === 'Executed') &&
      d.created_at.slice(0, 10) === todayStr
  ).length;
  const assets = [
    {
      symbol: 'mETH',
      name: 'Mantle Staked Ether',
      change: fmtPercent(market?.methChange),
      positive: (market?.methChange ?? 0) >= 0,
      price: fmtCurrency(market?.methPrice, 4),
      category: 'Staked ETH',
      walletBalance: walletBalances?.mETH.balance,
      walletValue:
        walletBalances && market?.methPrice !== null && market?.methPrice !== undefined
          ? `$${(Number(walletBalances.mETH.balance) * market.methPrice).toLocaleString(
              undefined,
              { maximumFractionDigits: 2 }
            )}`
          : undefined,
    },
    {
      symbol: 'USDY',
      name: 'Ondo US Dollar Yield',
      change: fmtPercent(market?.usdyChange),
      positive: (market?.usdyChange ?? 0) >= 0,
      price: fmtCurrency(market?.usdyPrice, 4),
      category: 'RWA Stablecoin',
      walletBalance: walletBalances?.USDY.balance,
      walletValue:
        walletBalances && market?.usdyPrice !== null && market?.usdyPrice !== undefined
          ? `$${(Number(walletBalances.USDY.balance) * market.usdyPrice).toLocaleString(
              undefined,
              { maximumFractionDigits: 2 }
            )}`
          : undefined,
    },
  ];

  const riskLabel =
    latestRisk === undefined ? 'No data' : latestRisk < 40 ? 'Low' : latestRisk < 65 ? 'Moderate' : 'High';
  const sentimentSub = market
    ? market.sentimentScore === null
      ? 'No data'
      : market.sentimentScore > 0.3
      ? 'Bullish'
      : market.sentimentScore < -0.3
        ? 'Bearish'
        : 'Neutral'
    : 'â€”';

  return (
    <div className={`min-h-screen ${bg} font-inter transition-colors duration-200`}>
      {/* Navbar */}
      <header className={`${navBg} border-b px-6 py-4 sticky top-0 z-10`}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={LOGO_URL} alt="Risk Whisperer" className="w-8 h-8 rounded-lg object-cover" />
            <div>
              <p className={`text-sm font-semibold ${heading}`}>Risk Whisperer</p>
              <p className={`text-xs ${sub}`}>Mantle RWA AI Agent</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => runAgent()}
              disabled={agentRunning || !ownerKey}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${
                agentRunning || !ownerKey
                  ? 'bg-blue-400 text-white cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {agentRunning ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play size={13} />
                  Run Agent
                </>
              )}
            </button>
            <span
              className={`border rounded-full px-3 py-1 text-xs inline-flex items-center gap-1.5 ${pillBg}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Agent Active
            </span>
            <div className="relative">
              <button
                onClick={() => setWalletMenuOpen((open) => !open)}
                className={`inline-flex border rounded-full px-3 py-1 text-xs items-center gap-1.5 transition-colors duration-150 ${pillBg} ${dark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
                title={walletError ?? (walletAddress ? 'Connected wallet' : 'Connect wallet')}
              >
                <Wallet size={10} />
                {walletAddress ? shortAddress(walletAddress) : (
                  <>
                    <span className="hidden sm:inline">Connect</span>
                    Wallet
                  </>
                )}
              </button>
              {walletMenuOpen && (
                <div
                  className={`absolute right-0 mt-2 w-56 rounded-xl border p-2 shadow-xl z-30 ${dark ? 'bg-[#1E1E1E] border-gray-700' : 'bg-white border-gray-200'}`}
                >
                  {walletAddress ? (
                    <>
                      <div className={`px-3 py-2 text-xs border-b mb-1 ${dark ? 'border-gray-700 text-gray-300' : 'border-gray-100 text-gray-600'}`}>
                        Connected: {shortAddress(walletAddress)}
                      </div>
                      <button
                        onClick={copyWalletAddress}
                        className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${dark ? 'hover:bg-gray-800 text-gray-200' : 'hover:bg-gray-50 text-gray-800'}`}
                      >
                        Copy address
                      </button>
                      <button
                        onClick={disconnectWallet}
                        className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${dark ? 'hover:bg-gray-800 text-red-400' : 'hover:bg-gray-50 text-red-600'}`}
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <>
                      <p className={`px-3 py-2 text-xs ${sub}`}>Choose wallet</p>
                      {walletOptions.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => connectWallet(option)}
                          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${dark ? 'hover:bg-gray-800 text-gray-200' : 'hover:bg-gray-50 text-gray-800'}`}
                        >
                          <span className="w-9 h-9 rounded-xl border border-green-600 bg-[#071407] flex items-center justify-center overflow-hidden shadow-[0_0_0_1px_rgba(34,197,94,0.18)]">
                            <WalletLogo id={option.id} />
                          </span>
                          <span>{option.name}</span>
                          {!option.provider && (
                            <span className={`ml-auto text-[10px] ${sub}`}>Not found</span>
                          )}
                        </button>
                      ))}
                    </>
                  )}
                  {walletError && (
                    <p className={`px-3 pt-2 text-[11px] ${walletError === 'Address copied' ? 'text-green-500' : 'text-red-500'}`}>
                      {walletError}
                    </p>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={toggleTheme}
              className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors duration-150 ${dark ? 'bg-[#262626] border-gray-700 text-gray-300 hover:bg-gray-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              aria-label="Toggle dark mode"
            >
              {dark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>
        {agentError && (
          <div className="max-w-6xl mx-auto mt-2">
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              âš  {agentError}
            </p>
          </div>
        )}
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className={`text-3xl font-semibold ${heading} tracking-tight`}>Risk Whisperer</h1>
          <p className={`${sub} text-sm mt-1`}>
            Autonomous RWA risk manager â€” every recommendation logged with market context.
          </p>
        </div>

        <div className={`flex gap-6 border-b ${divider} mb-8`}>
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm -mb-[1px] border-b-2 transition-colors duration-150 ${activeTab === tab ? `font-medium ${tabActive}` : `font-normal ${tabInactive}`}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {activeTab === 'Overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`${card} rounded-xl border p-5 flex items-center gap-4`}>
                <div
                  className="relative flex items-center justify-center"
                  style={{ width: 64, height: 64 }}
                >
                  <RingChart value={latestRisk ?? 0} size={64} color="#EA580C" dark={dark} />
                  <span className={`absolute text-xs font-semibold ${heading}`}>
                    {latestRisk === undefined ? 'â€”' : `${latestRisk}%`}
                  </span>
                </div>
                <div>
                  <p className={`text-xs font-medium ${sub} mb-0.5`}>Risk Score</p>
                  <p className={`text-sm font-semibold ${heading}`}>{riskLabel}</p>
                  <p className={`text-xs ${sub}`}>
                    {latestRisk === undefined || prevRisk === undefined
                      ? 'Run agent to generate risk'
                      : latestRisk < prevRisk
                        ? `â†“ from ${prevRisk}%`
                        : latestRisk > prevRisk
                          ? `â†‘ from ${prevRisk}%`
                          : 'Unchanged'}
                  </p>
                </div>
              </div>
              <div className={`${card} rounded-xl border p-5`}>
                <p className={`text-xs font-medium ${sub} mb-1`}>Actions Today</p>
                <p className={`text-2xl font-semibold ${heading}`}>{recommendedToday}</p>
                <p className={`text-xs ${sub} mt-1`}>recommendations today</p>
              </div>
              <div className={`${card} rounded-xl border p-5`}>
                <p className={`text-xs font-medium ${sub} mb-1`}>Total Decisions</p>
                <p className={`text-2xl font-semibold ${heading}`}>{decisions.length}</p>
                <p className={`text-xs ${sub} mt-1 flex items-center gap-1`}>
                  <Clock size={11} />
                  {market ? `Updated ${fmtTime(market.fetchedAt)}` : 'Live data'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className={`${card} rounded-xl border p-6 md:col-span-1`}>
                <h2 className={`text-base font-semibold ${heading} mb-1`}>Tracked Assets</h2>
                <p className={`text-sm ${sub} mb-5`}>Live market data and wallet readings only</p>
                <div className="space-y-4">
                  {assets.map((asset) => (
                    <div key={asset.symbol} className={`border ${signalCard} rounded-xl p-4`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={`text-sm font-semibold ${heading}`}>{asset.symbol}</p>
                          <p className={`text-xs ${sub}`}>{asset.category}</p>
                        </div>
                        <span
                          className={`text-xs ${asset.positive ? 'text-green-600' : 'text-red-500'}`}
                        >
                          {asset.change}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className={`text-xs ${sub}`}>Current price</span>
                        <span className={`text-sm font-medium ${heading}`}>{asset.price}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`${card} rounded-xl border p-6 md:col-span-2`}>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className={`text-base font-semibold ${heading}`}>Recent Decisions</h2>
                    <p className={`text-sm ${sub} mt-0.5`}>Live AI reasoning log</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('Risk Log')}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium inline-flex items-center gap-1.5 transition-colors duration-150 ${dark ? 'bg-blue-950 text-blue-400 hover:bg-blue-900' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                  >
                    View all <ChevronRight size={13} />
                  </button>
                </div>
                {decisionsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className={`h-16 rounded-lg ${barBg} animate-pulse`} />
                    ))}
                  </div>
                ) : decisions.length === 0 ? (
                  <div className={`text-center py-10 ${sub}`}>
                    <p className="text-sm">No decisions yet.</p>
                    <p className="text-xs mt-1">
                      Click <strong>Run Agent</strong> to generate the first one.
                    </p>
                  </div>
                ) : (
                  <div>
                    {decisions.slice(0, 3).map((entry, i) => (
                      <div
                        key={entry.id}
                        className={`py-4 ${i < 2 ? `border-b ${innerDivider}` : ''}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <TriggerPill trigger={entry.trigger_type} dark={dark} />
                              <ActionPill action={entry.action} dark={dark} />
                            </div>
                            <p
                              className={`text-sm ${dark ? 'text-gray-300' : 'text-gray-600'} leading-relaxed line-clamp-2`}
                            >
                              {entry.reasoning}
                            </p>
                            <p
                              className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'} mt-1.5`}
                            >
                              {fmtDate(entry.created_at)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <StatusPill status={entry.status} dark={dark} />
                            <span
                              className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'} font-mono`}
                            >
                              Run #{entry.id}
                            </span>
                            <button
                              type="button"
                              onClick={() => requestDeleteDecision(entry.id)}
                              disabled={decisionDeleting && deletingDecisionId === entry.id}
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${
                                dark
                                  ? 'text-red-300 hover:bg-red-950/50'
                                  : 'text-red-600 hover:bg-red-50'
                              }`}
                              title="Delete decision"
                            >
                              <Trash2 size={12} />
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Market Signals */}
            <div className={`${card} rounded-xl border p-6`}>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className={`text-base font-semibold ${heading} mb-1`}>Live Market Signals</h2>
                  <p className={`text-sm ${sub}`}>Real-time feeds the agent monitors</p>
                </div>
                {market && (
                  <span className={`text-xs ${sub}`}>Updated {fmtTime(market.fetchedAt)}</span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  {
                    label: 'ETH Funding Rate',
                    value: marketLoading ? '—' : fmtPercent(market?.fundingRate, 4),
                    info:
                      market?.fundingRate !== null && market?.fundingRate !== undefined
                        ? market.fundingRate >= 0
                          ? 'Positive (bullish)'
                          : 'Negative (bearish)'
                        : marketLoading
                          ? 'Loading...'
                          : 'No data',
                    icon: (
                      <TrendingUp
                        size={14}
                        className={
                          market?.fundingRate !== null &&
                          market?.fundingRate !== undefined &&
                          market.fundingRate >= 0
                            ? 'text-green-500'
                            : 'text-red-400'
                        }
                      />
                    ),
                  },
                  {
                    label: 'USDY Peg Deviation',
                    value:
                      marketLoading || market?.usdyPegDeviation === null
                        ? '—'
                        : `${market?.usdyPegDeviation}%`,
                    info:
                      market?.usdyPegDeviation !== null && market?.usdyPegDeviation !== undefined
                        ? market.usdyPegDeviation < 0.5
                          ? 'Healthy - no action'
                          : 'Warning'
                        : marketLoading
                          ? 'Loading...'
                          : 'No data',
                    icon: (
                      <ShieldCheck
                        size={14}
                        className={
                          market?.usdyPegDeviation !== null &&
                          market?.usdyPegDeviation !== undefined &&
                          market.usdyPegDeviation < 0.5
                            ? 'text-green-500'
                            : 'text-red-400'
                        }
                      />
                    ),
                  },
                  {
                    label: 'Crypto Sentiment',
                    value:
                      marketLoading ||
                      market?.sentimentScore === null ||
                      market?.sentimentScore === undefined
                        ? '—'
                        : `${market?.sentimentScore >= 0 ? '+' : ''}${market?.sentimentScore}`,
                    info: marketLoading ? 'Loading...' : sentimentSub,
                    icon: (
                      <Eye
                        size={14}
                        className={
                          market?.sentimentScore !== null &&
                          market?.sentimentScore !== undefined &&
                          market.sentimentScore > 0
                            ? 'text-green-500'
                            : 'text-orange-500'
                        }
                      />
                    ),
                  },
                  {
                    label: 'Mantle TVL Change',
                    value: marketLoading ? '—' : fmtPercent(market?.mantleTvlChange),
                    info:
                      market?.mantleTvlChange !== null && market?.mantleTvlChange !== undefined
                        ? market.mantleTvlChange >= 0
                          ? 'Ecosystem growing'
                          : 'Contraction'
                        : marketLoading
                          ? 'Loading...'
                          : 'No data',
                    icon: (
                      <Activity
                        size={14}
                        className={
                          market?.mantleTvlChange !== null &&
                          market?.mantleTvlChange !== undefined &&
                          market.mantleTvlChange >= 0
                            ? 'text-blue-500'
                            : 'text-red-400'
                        }
                      />
                    ),
                  },
                ].map((signal) => (
                  <div key={signal.label} className={`border ${signalCard} rounded-xl p-4`}>
                    <div className="flex items-center gap-1.5 mb-2">
                      {signal.icon}
                      <p className={`text-xs font-medium ${sub}`}>{signal.label}</p>
                    </div>
                    <p className={`text-lg font-semibold ${heading}`}>{signal.value}</p>
                    <p className={`text-xs ${sub} mt-0.5`}>{signal.info}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* RISK LOG */}
        {activeTab === 'Risk Log' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className={`text-base font-semibold ${heading}`}>AI Decision Log</h2>
                <p className={`text-sm ${sub} mt-0.5`}>
                  Saved to the database with the market snapshot used by the agent
                </p>
              </div>
              <span
                className={`border rounded-full px-3 py-1 text-xs inline-flex items-center gap-1.5 ${pillBg}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                {decisions.length} entries recorded
              </span>
            </div>
            {decisionsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className={`h-24 rounded-xl ${barBg} animate-pulse`} />
                ))}
              </div>
            ) : decisions.length === 0 ? (
              <div className={`${card} rounded-xl border p-12 text-center`}>
                <p className={`text-sm ${sub}`}>No decisions recorded yet.</p>
                <p className={`text-xs ${sub} mt-1`}>
                  Click <strong>Run Agent</strong> in the navbar to generate your first AI decision.
                </p>
              </div>
            ) : (
              decisions.map((entry) => {
                const key = String(entry.id);
                const snapshot = entry.market_snapshot;
                const aiResearch = snapshot?.ai;
                const researchSources = snapshot?.research?.sources ?? [];
                return (
                  <div
                    key={entry.id}
                    className={`${card} rounded-xl border transition-colors duration-150 ${dark ? 'hover:border-gray-700' : 'hover:border-gray-300'}`}
                  >
                    <div className="flex items-start gap-3 p-5">
                      <button
                        type="button"
                        className="flex-1 text-left"
                        onClick={() => setExpandedLog(expandedLog === key ? null : key)}
                      >
                        <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <TriggerPill trigger={entry.trigger_type} dark={dark} />
                            <ActionPill action={entry.action} dark={dark} />
                            <StatusPill status={entry.status} dark={dark} />
                          </div>
                          <p
                            className={`text-sm ${dark ? 'text-gray-300' : 'text-gray-600'} leading-relaxed line-clamp-2`}
                          >
                            {entry.reasoning}
                          </p>
                          <div className="flex items-center gap-4 mt-2">
                            <span className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                              {fmtDate(entry.created_at)}
                            </span>
                            <span
                              className={`font-mono text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}
                            >
                              Run #{entry.id}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs ${sub}`}>Confidence</span>
                            <div
                              className="relative flex items-center justify-center"
                              style={{ width: 36, height: 36 }}
                            >
                              <RingChart
                                value={entry.confidence}
                                size={36}
                                color={
                                  entry.confidence > 85
                                    ? '#2563EB'
                                    : entry.confidence > 70
                                      ? '#EA580C'
                                      : '#9CA3AF'
                                }
                                dark={dark}
                              />
                              <span className={`absolute text-[8px] font-semibold ${heading}`}>
                                {entry.confidence}%
                              </span>
                            </div>
                          </div>
                          <ChevronRight
                            size={16}
                            className={`${dark ? 'text-gray-500' : 'text-gray-400'} transition-transform duration-200 ${expandedLog === key ? 'rotate-90' : ''}`}
                          />
                        </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => requestDeleteDecision(entry.id)}
                        disabled={decisionDeleting && deletingDecisionId === entry.id}
                        className={`mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${
                          dark
                            ? 'text-red-300 hover:bg-red-950/50'
                            : 'text-red-600 hover:bg-red-50'
                        }`}
                        title="Delete decision"
                        aria-label="Delete decision"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {expandedLog === key && (
                      <div className={`border-t ${innerDivider} p-5`}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                          <div>
                            <p className={`text-xs font-medium ${sub} mb-2`}>Full Reasoning</p>
                            <p
                              className={`text-sm ${dark ? 'text-gray-300' : 'text-gray-600'} leading-relaxed`}
                            >
                              {entry.reasoning}
                            </p>
                          </div>
                          <div className="space-y-3">
                            <p className={`text-xs font-medium ${sub}`}>Execution Details</p>
                            {entry.action !== 'Hold' && entry.from_asset !== '-' && (
                              <div className="flex items-center gap-2">
                                <span className={`border rounded-full px-3 py-1 text-xs ${pillBg}`}>
                                  {entry.from_asset}
                                </span>
                                <ArrowRightLeft
                                  size={12}
                                  className={dark ? 'text-gray-500' : 'text-gray-400'}
                                />
                                <span className={`border rounded-full px-3 py-1 text-xs ${pillBg}`}>
                                  {entry.to_asset}
                                </span>
                              </div>
                            )}
                            <p className={`text-sm ${heading} font-medium`}>
                              {entry.amount === '-' ? 'No trade recommended' : entry.amount}
                            </p>
                          </div>
                          <div className="space-y-3">
                            <p className={`text-xs font-medium ${sub}`}>Risk Delta</p>
                            <div className="flex items-center gap-3">
                              <div className="text-center">
                                <div
                                  className="relative inline-flex items-center justify-center"
                                  style={{ width: 48, height: 48 }}
                                >
                                  <RingChart
                                    value={entry.risk_before}
                                    size={48}
                                    color="#9CA3AF"
                                    dark={dark}
                                  />
                                  <span className={`absolute text-[9px] font-semibold ${heading}`}>
                                    {entry.risk_before}%
                                  </span>
                                </div>
                                <p
                                  className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'} mt-1`}
                                >
                                  Before
                                </p>
                              </div>
                              <ChevronRight
                                size={14}
                                className={dark ? 'text-gray-500' : 'text-gray-400'}
                              />
                              <div className="text-center">
                                <div
                                  className="relative inline-flex items-center justify-center"
                                  style={{ width: 48, height: 48 }}
                                >
                                  <RingChart
                                    value={entry.risk_after}
                                    size={48}
                                    color={
                                      entry.risk_after < entry.risk_before ? '#10B981' : '#EA580C'
                                    }
                                    dark={dark}
                                  />
                                  <span className={`absolute text-[9px] font-semibold ${heading}`}>
                                    {entry.risk_after}%
                                  </span>
                                </div>
                                <p
                                  className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'} mt-1`}
                                >
                                  After
                                </p>
                              </div>
                            </div>
                            <p className={`text-xs ${sub}`}>
                              Simulated ID: <span className="font-mono">{entry.tx_hash}</span>
                            </p>
                          </div>
                        </div>
                        {(aiResearch?.research_brief || researchSources.length > 0) && (
                          <div className={`mt-5 border-t ${innerDivider} pt-5`}>
                            <div className="flex items-center justify-between gap-4 mb-4">
                              <div>
                                <p className={`text-xs font-medium ${sub}`}>Autonomous Research</p>
                                <p className={`text-sm ${heading} font-medium mt-1`}>
                                  Evidence trail used before the recommendation
                                </p>
                              </div>
                              <span className={`border rounded-full px-3 py-1 text-xs ${pillBg}`}>
                                {researchSources.length} sources
                              </span>
                            </div>

                            {aiResearch?.research_brief && (
                              <p
                                className={`text-sm ${dark ? 'text-gray-300' : 'text-gray-600'} leading-relaxed mb-4`}
                              >
                                {aiResearch.research_brief}
                              </p>
                            )}

                            {Boolean(aiResearch?.key_findings?.length) && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                {aiResearch?.key_findings?.map((finding) => (
                                  <div
                                    key={finding}
                                    className={`rounded-xl border ${signalCard} p-3 text-sm ${
                                      dark ? 'text-gray-300' : 'text-gray-600'
                                    }`}
                                  >
                                    {finding}
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {researchSources.map((source) => (
                                <div key={source.label} className={`rounded-xl border ${signalCard} p-3`}>
                                  <div className="flex items-center justify-between gap-3 mb-2">
                                    <p className={`text-sm font-medium ${heading}`}>{source.label}</p>
                                    <span className={`text-xs ${sub}`}>{source.signal}</span>
                                  </div>
                                  <p className={`text-xs ${sub} leading-relaxed`}>{source.summary}</p>
                                  {source.url.startsWith('http') && (
                                    <a
                                      href={source.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-2 inline-flex text-xs text-blue-500 hover:text-blue-600"
                                    >
                                      View source
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ASSETS */}
        {activeTab === 'Assets' && (
          <div className="space-y-6">
            <div className={`${card} rounded-xl border p-6`}>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className={`text-base font-semibold ${heading}`}>Connected Wallet Holdings</h2>
                  <p className={`text-sm ${sub} mt-0.5`}>
                    Read-only USDY and mETH balances on Mantle Mainnet
                  </p>
                </div>
                <span className={`border rounded-full px-3 py-1 text-xs ${pillBg}`}>
                  {walletAddress ? shortAddress(walletAddress) : 'Connect wallet to test real tokens'}
                </span>
              </div>

              {!walletAddress ? (
                <p className={`text-sm ${sub} mt-5`}>
                  Use MetaMask, Rabby, or another injected wallet to read your real Mantle token
                  balances. This does not request a signature or token approval.
                </p>
              ) : walletBalancesLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
                  <div className={`h-20 rounded-xl ${barBg} animate-pulse`} />
                  <div className={`h-20 rounded-xl ${barBg} animate-pulse`} />
                </div>
              ) : walletBalancesError ? (
                <div
                  className={`mt-5 rounded-xl border p-4 text-sm ${
                    dark
                      ? 'border-orange-900 bg-orange-950/30 text-orange-200'
                      : 'border-orange-200 bg-orange-50 text-orange-700'
                  }`}
                >
                  {walletBalancesError instanceof Error
                    ? walletBalancesError.message
                    : 'Could not read wallet balances.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
                  {(['mETH', 'USDY'] as TokenSymbol[]).map((symbol) => {
                    const tokenBalance = walletBalances?.[symbol];
                    const marketPrice =
                      symbol === 'mETH' ? market?.methPrice : market?.usdyPrice;
                    const walletValue =
                      tokenBalance && marketPrice
                        ? Number(tokenBalance.balance) * marketPrice
                        : undefined;

                    return (
                      <div key={symbol} className={`rounded-xl border ${signalCard} p-4`}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className={`text-sm font-semibold ${heading}`}>{symbol}</p>
                            <p className={`text-xs ${sub}`}>{MANTLE_TOKENS[symbol].name}</p>
                          </div>
                          <span className={`text-xs ${sub}`}>Real balance</span>
                        </div>
                        <p className={`text-2xl font-semibold ${heading} mt-3`}>
                          {tokenBalance?.balance ?? '0'}
                        </p>
                        <p className={`text-xs ${sub} mt-1`}>
                          {walletValue === undefined
                            ? 'Waiting for market price'
                            : `~$${walletValue.toLocaleString(undefined, {
                                maximumFractionDigits: 2,
                              })}`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {assets.map((asset) => (
                <div key={asset.symbol} className={`${card} rounded-xl border p-6`}>
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <h3 className={`text-lg font-semibold ${heading} mb-1`}>{asset.symbol}</h3>
                      <p className={`text-sm ${sub}`}>{asset.name}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-semibold ${heading}`}>{asset.price}</p>
                      <p
                        className={`text-sm ${asset.positive ? 'text-green-600' : 'text-red-500'}`}
                      >
                        {asset.change} 24h
                      </p>
                    </div>
                  </div>
                  <div className={`space-y-3 border-t ${innerDivider} pt-5`}>
                    {[
                      { label: 'Current Price', value: asset.price },
                      {
                        label: 'Wallet Balance',
                        value: asset.walletBalance
                          ? `${asset.walletBalance} ${asset.symbol}`
                          : walletAddress
                            ? '0'
                            : 'Not connected',
                      },
                      {
                        label: 'Wallet Value',
                        value: asset.walletValue ?? (walletAddress ? 'â€”' : 'Not connected'),
                      },
                      { label: 'Category', value: asset.category },
                    ].map((row) => (
                      <div key={row.label} className="flex justify-between">
                        <span className={`text-sm ${sub}`}>{row.label}</span>
                        <span className={`text-sm font-medium ${heading}`}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <footer className={`border-t ${divider} mt-12`}>
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={LOGO_URL} alt="Risk Whisperer" className="w-7 h-7 rounded-lg object-cover" />
            <div>
              <p className={`text-sm font-semibold ${heading}`}>Risk Whisperer</p>
              <p className={`text-xs ${sub}`}>Mantle RWA risk monitor</p>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <a
              href="https://explorer.mantle.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className={`text-xs ${sub} hover:underline`}
            >
              Mantle Explorer
            </a>
          </div>
          <p className={`text-xs ${sub}`}>Risk Whisperer</p>
        </div>
      </footer>
    </div>
  );
}
