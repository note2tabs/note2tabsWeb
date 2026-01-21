import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

type DailyPoint = { date: string; visitors: number; signups: number; activeUsers: number; transcriptions: number };
type FunnelStep = { label: string; value: number; pct?: number };
type BreakdownEntry = { name: string; value: number };
type ErrorEntry = { message: string; count: number };

const COLORS = ["#2a6df4", "#1fbf9f", "#f97316", "#22c55e", "#ec4899", "#a855f7"];
const tooltipStyle = { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12 };
const axisColor = "#94a3b8";

export function TimeSeriesChart({ data }: { data: DailyPoint[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="date" stroke={axisColor} fontSize={12} />
          <YAxis stroke={axisColor} fontSize={12} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
          <Line type="monotone" dataKey="visitors" stroke="#2a6df4" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="signups" stroke="#7c3aed" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="activeUsers" stroke="#14b8a6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="transcriptions" stroke="#f97316" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FunnelBars({ steps }: { steps: FunnelStep[] }) {
  const data = steps.map((s) => ({ name: s.label, value: s.value }));
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical">
          <XAxis type="number" stroke={axisColor} fontSize={12} />
          <YAxis dataKey="name" type="category" stroke={axisColor} fontSize={12} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" fill="#2a6df4" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data }: { data: BreakdownEntry[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
            {data.map((_, idx) => (
              <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ErrorBarChart({ data }: { data: ErrorEntry[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis
            dataKey="message"
            stroke={axisColor}
            fontSize={12}
            tick={{ fontSize: 10 }}
            interval={0}
            angle={-20}
            textAnchor="end"
          />
          <YAxis stroke={axisColor} fontSize={12} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="count" fill="#f97316" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
