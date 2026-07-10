/**
 * Plan Service — Plano Operacional do trader
 * --------------------------------------------------------------
 * 1 linha por usuário em trading_plans. fetchPlan devolve defaults
 * se a linha ainda não existe (ela só é criada no primeiro save,
 * via upsert). Ponte snake_case (banco) ↔ camelCase (app) aqui.
 */
import { supabase } from '../supabase-client.js';

const TABLE = 'trading_plans';

const DEFAULTS = {
  traderName: '',
  style: 'intraday',
  market: '',
  behavioralRules: '',
  committed: false,
  dailyStop: null,
  weeklyStop: null,
  riskPerTrade: null,
  maxDailyRisk: null,
  setup1Name: '',
  setup1Description: '',
  setup2Name: '',
  setup2Description: '',
  setup3Name: '',
  setup3Description: '',
  noTradeRules: ''
};

export async function fetchPlan(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error('Falha ao carregar plano operacional: ' + error.message);
  if (!data) return { ...DEFAULTS };
  return normalize(data);
}

export async function savePlan(userId, plan) {
  const payload = {
    user_id:            userId,
    trader_name:        plan.traderName        ?? '',
    style:              plan.style             ?? 'intraday',
    market:             plan.market            ?? '',
    behavioral_rules:   plan.behavioralRules   ?? '',
    committed:          !!plan.committed,
    daily_stop:         plan.dailyStop         ?? null,
    weekly_stop:        plan.weeklyStop        ?? null,
    risk_per_trade:     plan.riskPerTrade      ?? null,
    max_daily_risk:     plan.maxDailyRisk      ?? null,
    setup1_name:        plan.setup1Name        ?? '',
    setup1_description: plan.setup1Description ?? '',
    setup2_name:        plan.setup2Name        ?? '',
    setup2_description: plan.setup2Description ?? '',
    setup3_name:        plan.setup3Name        ?? '',
    setup3_description: plan.setup3Description ?? '',
    no_trade_rules:     plan.noTradeRules      ?? ''
  };

  const { error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'user_id' });
  if (error) throw new Error('Falha ao salvar plano operacional: ' + error.message);
}

function normalize(row) {
  return {
    traderName:        row.trader_name        ?? '',
    style:             row.style              ?? 'intraday',
    market:            row.market             ?? '',
    behavioralRules:   row.behavioral_rules   ?? '',
    committed:         !!row.committed,
    dailyStop:         row.daily_stop         !== null ? Number(row.daily_stop)     : null,
    weeklyStop:        row.weekly_stop        !== null ? Number(row.weekly_stop)    : null,
    riskPerTrade:      row.risk_per_trade     !== null ? Number(row.risk_per_trade) : null,
    maxDailyRisk:      row.max_daily_risk     !== null ? Number(row.max_daily_risk) : null,
    setup1Name:        row.setup1_name        ?? '',
    setup1Description: row.setup1_description ?? '',
    setup2Name:        row.setup2_name        ?? '',
    setup2Description: row.setup2_description ?? '',
    setup3Name:        row.setup3_name        ?? '',
    setup3Description: row.setup3_description ?? '',
    noTradeRules:      row.no_trade_rules     ?? ''
  };
}
