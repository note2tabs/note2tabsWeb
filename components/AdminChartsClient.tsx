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

const COLORS = ["#60a5fa", "#a78bfa", "#f472b6", "#38bdf8", "#34d399", "#facc15"];

export function TimeSeriesChart({ data }: { data: DailyPoint[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
          <YAxis stroke="#94a3b8" fontSize={12} />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
          <Legend />
          <Line type="monotone" dataKey="visitors" stroke="#60a5fa" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="signups" stroke="#a78bfa" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="activeUsers" stroke="#34d399" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="transcriptions" stroke="#f472b6" strokeWidth={2} dot={false} />
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
          <XAxis type="number" stroke="#94a3b8" fontSize={12} />
          <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
          <Bar dataKey="value" fill="#60a5fa" />
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
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
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
          <XAxis dataKey="message" stroke="#94a3b8" fontSize={12} tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" />
          <YAxis stroke="#94a3b8" fontSize={12} />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
          <Bar dataKey="count" fill="#f472b6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
