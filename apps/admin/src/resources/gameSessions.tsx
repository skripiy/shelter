'use client';

import {
  List, Datagrid, TextField, ReferenceField, SelectField, DateField,
  NumberField, Show, SimpleShowLayout, WithRecord,
} from 'react-admin';
import Chip from '@mui/material/Chip';

const statusChoices = [
  { id: 'waiting',  name: '⏳ Очікування' },
  { id: 'active',   name: '🟢 Активна' },
  { id: 'voting',   name: '🗳️ Голосування' },
  { id: 'finished', name: '✅ Завершена' },
];

const statusColors: Record<string, 'default' | 'warning' | 'success' | 'error' | 'primary'> = {
  waiting: 'default',
  active: 'success',
  voting: 'warning',
  finished: 'primary',
};

const StatusBadge = () => (
  <WithRecord render={(record) => (
    <Chip
      label={statusChoices.find((s) => s.id === record.status)?.name ?? record.status}
      color={statusColors[record.status] ?? 'default'}
      size="small"
    />
  )} />
);

export const GameSessionList = () => (
  <List
    sort={{ field: 'created_at', order: 'DESC' }}
    hasCreate={false}
    filters={[
      <SelectField key="status" source="status" choices={statusChoices} />,
    ]}
  >
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="room_code" label="Код кімнати" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }} />
      <StatusBadge />
      <ReferenceField source="catastrophe_id" reference="catastrophes" label="Катастрофа" link={false}>
        <TextField source="name" />
      </ReferenceField>
      <ReferenceField source="shelter_id" reference="shelter_templates" label="Укриття" link={false}>
        <TextField source="name" />
      </ReferenceField>
      <NumberField source="survival_score" label="Бал виживання" />
      <DateField source="created_at" label="Створена" showTime />
      <DateField source="finished_at" label="Завершена" showTime />
    </Datagrid>
  </List>
);

export const GameSessionShow = () => (
  <Show title="Ігрова сесія">
    <SimpleShowLayout>
      <TextField source="room_code" label="Код кімнати" />
      <SelectField source="status" label="Статус" choices={statusChoices} />
      <ReferenceField source="catastrophe_id" reference="catastrophes" label="Катастрофа">
        <TextField source="name" />
      </ReferenceField>
      <ReferenceField source="shelter_id" reference="shelter_templates" label="Укриття">
        <TextField source="name" />
      </ReferenceField>
      <NumberField source="current_round" label="Поточний раунд" />
      <NumberField source="survival_score" label="Бал виживання (0-100)" />
      <TextField source="epilogue" label="Епілог" />
      <DateField source="created_at" label="Створена" showTime />
      <DateField source="finished_at" label="Завершена" showTime />
    </SimpleShowLayout>
  </Show>
);
