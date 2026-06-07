'use client';

import {
  List, Datagrid, TextField, BooleanField, SelectField, EditButton, DeleteButton,
  Edit, Create, SimpleForm, TextInput, SelectInput, BooleanInput,
  required, Show, SimpleShowLayout,
} from 'react-admin';

const severityChoices = [
  { id: 'low',     name: '🟢 Низька' },
  { id: 'medium',  name: '🟡 Середня' },
  { id: 'high',    name: '🟠 Висока' },
  { id: 'extreme', name: '🔴 Критична' },
];

export const CatastropheList = () => (
  <List sort={{ field: 'created_at', order: 'DESC' }} filters={[
    <TextInput key="q" source="q" label="Пошук" alwaysOn />,
    <SelectInput key="severity" source="severity" label="Рівень" choices={severityChoices} />,
    <BooleanInput key="is_active" source="is_active" label="Активні" />,
  ]}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="name" label="Назва" />
      <TextField source="description" label="Опис" sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} />
      <SelectField source="severity" label="Рівень" choices={severityChoices} />
      <BooleanField source="is_active" label="Активна" />
      <EditButton label="" />
      <DeleteButton label="" />
    </Datagrid>
  </List>
);

const CatastropheForm = () => (
  <SimpleForm>
    <TextInput source="name" label="Назва катастрофи" validate={required()} fullWidth />
    <TextInput source="description" label="Опис" multiline rows={4} fullWidth />
    <SelectInput source="severity" label="Рівень небезпеки" choices={severityChoices} defaultValue="high" />
    <BooleanInput source="is_active" label="Активна (видима в грі)" defaultValue />
  </SimpleForm>
);

export const CatastropheEdit = () => (
  <Edit title="Редагувати катастрофу">
    <CatastropheForm />
  </Edit>
);

export const CatastropheCreate = () => (
  <Create title="Нова катастрофа">
    <CatastropheForm />
  </Create>
);

export const CatastropheShow = () => (
  <Show title="Катастрофа">
    <SimpleShowLayout>
      <TextField source="name" label="Назва" />
      <TextField source="description" label="Опис" />
      <SelectField source="severity" label="Рівень" choices={severityChoices} />
      <BooleanField source="is_active" label="Активна" />
      <TextField source="created_at" label="Створено" />
    </SimpleShowLayout>
  </Show>
);
