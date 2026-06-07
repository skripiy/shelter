'use client';

import {
  List, Datagrid, TextField, BooleanField, NumberField, EditButton, DeleteButton,
  Edit, Create, SimpleForm, TextInput, BooleanInput, NumberInput, ArrayInput, SimpleFormIterator,
  required,
} from 'react-admin';

export const ShelterTemplateList = () => (
  <List sort={{ field: 'name', order: 'ASC' }}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="name" label="Назва укриття" />
      <NumberField source="capacity" label="Місць" />
      <TextField source="description" label="Опис" sx={{ maxWidth: 280, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} />
      <BooleanField source="is_active" label="Активне" />
      <EditButton label="" />
      <DeleteButton label="" />
    </Datagrid>
  </List>
);

const ShelterForm = () => (
  <SimpleForm>
    <TextInput source="name" label="Назва укриття" validate={required()} fullWidth />
    <TextInput source="description" label="Опис" multiline rows={3} fullWidth />
    <NumberInput
      source="capacity"
      label="Кількість місць"
      defaultValue={3}
      min={1}
      max={10}
      validate={required()}
    />

    <TextInput source="resources.food_years" label="Запас їжі (років)" helperText="Напр. 10" />
    <BooleanInput source="resources.water" label="Є вода" />
    <BooleanInput source="resources.electricity" label="Є електрика" />
    <BooleanInput source="resources.medical" label="Є медикаменти" />
    <BooleanInput source="resources.weapons" label="Є зброя" />

    <ArrayInput source="conditions" label="Умови укриття">
      <SimpleFormIterator>
        <TextInput source="" label="Умова" fullWidth />
      </SimpleFormIterator>
    </ArrayInput>

    <BooleanInput source="is_active" label="Активне" defaultValue />
  </SimpleForm>
);

export const ShelterTemplateEdit = () => (
  <Edit title="Редагувати укриття">
    <ShelterForm />
  </Edit>
);

export const ShelterTemplateCreate = () => (
  <Create title="Нове укриття">
    <ShelterForm />
  </Create>
);
