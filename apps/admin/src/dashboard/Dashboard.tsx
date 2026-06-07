'use client';

import { useEffect, useState } from 'react';
import { Title } from 'react-admin';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { supabase } from '../supabaseClient';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

interface Stats {
  total_sessions: number;
  active_sessions: number;
  finished_sessions: number;
  total_catastrophes: number;
  total_cards: number;
  avg_survival_score: number | null;
}

interface StatCardProps {
  label: string;
  value: string | number;
  color?: string;
  emoji?: string;
}

const StatCard = ({ label, value, color = '#3b82f6', emoji }: StatCardProps) => (
  <Card sx={{ height: '100%', borderTop: `4px solid ${color}` }}>
    <CardContent>
      <Typography variant="h4" fontWeight="bold" color={color}>
        {emoji && <span style={{ marginRight: 8 }}>{emoji}</span>}
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary" mt={1}>
        {label}
      </Typography>
    </CardContent>
  </Card>
);

export const Dashboard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [topCatastrophes, setTopCatastrophes] = useState<{ name: string; count: number }[]>([]);

  useEffect(() => {
    const load = async () => {
      // Stats
      const { data: s } = await supabase.from('admin_stats').select('*').single();
      if (s) setStats(s as Stats);

      // Top catastrophes used in games
      const { data: sessions } = await supabase
        .from('game_sessions')
        .select('catastrophe_id, catastrophes(name)')
        .not('catastrophe_id', 'is', null)
        .limit(100);

      if (sessions) {
        const counts: Record<string, { name: string; count: number }> = {};
        for (const s of sessions as any[]) {
          const id = s.catastrophe_id;
          const name = s.catastrophes?.name ?? 'Невідомо';
          if (!counts[id]) counts[id] = { name, count: 0 };
          counts[id].count++;
        }
        setTopCatastrophes(
          Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 5)
        );
      }
    };
    load();
  }, []);

  const COLORS = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#eab308'];

  return (
    <Box p={3}>
      <Title title="Shelter Accord — Адмін-панель" />
      <Typography variant="h5" fontWeight="bold" mb={3}>
        🏚️ Shelter Accord — Дашборд
      </Typography>

      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Всього сесій"
            value={stats?.total_sessions ?? '…'}
            color="#3b82f6"
            emoji="🎮"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Активні сесії"
            value={stats?.active_sessions ?? '…'}
            color="#22c55e"
            emoji="🟢"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Завершені ігри"
            value={stats?.finished_sessions ?? '…'}
            color="#6b7280"
            emoji="✅"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Середній бал виживання"
            value={stats?.avg_survival_score != null
              ? `${Math.round(stats.avg_survival_score)}%`
              : '—'}
            color="#f97316"
            emoji="📊"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Активних катастроф"
            value={stats?.total_catastrophes ?? '…'}
            color="#ef4444"
            emoji="☢️"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Активних карток"
            value={stats?.total_cards ?? '…'}
            color="#a855f7"
            emoji="🃏"
          />
        </Grid>
      </Grid>

      {topCatastrophes.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" mb={2}>
              🔥 Топ катастроф у іграх
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topCatastrophes} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Ігор">
                  {topCatastrophes.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};
