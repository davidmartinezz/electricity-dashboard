export interface AFRRPoint {
  ts: string
  up_pred: number
  down_pred: number
  up_real: number | null
  down_real: number | null
  up_error: number | null
  down_error: number | null
}

export interface AFRRMetrics {
  mae: number
  rmse: number
  max_error: number
}

export interface AFRRData {
  date: string
  generated_at: string
  series: AFRRPoint[]
  stats_pred: {
    up: { min: number; max: number; mean: number; median: number }
    down: { min: number; max: number; mean: number; median: number }
  }
  metrics_up: AFRRMetrics | null
  metrics_down: AFRRMetrics | null
  has_real: boolean
  ai_report: string | null
}

export interface IDA1Point {
  ts: string
  pred: number
  real: number | null
  error: number | null
}

export interface IDA1Metrics {
  mae: number
  rmse: number
  max_error: number
}

export interface IDA1Data {
  date: string
  generated_at: string
  series: IDA1Point[]
  stats_pred: {
    min: number
    max: number
    mean: number
    std: number
    median: number
  }
  hourly_pred: Record<string, number>
  metrics: IDA1Metrics | null
  has_real: boolean
  ai_report: string | null
}

export interface DateList {
  afrr: string[]
  ida1: string[]
}

export interface AFRRHistoryPoint {
  date: string
  mae_up: number
  mae_down: number | null
  rmse_up: number
}

export interface IDA1HistoryPoint {
  date: string
  mae: number
  rmse: number
}
