'use client';

import {
  List, Datagrid, TextField, BooleanField, NumberField, ReferenceField,
  ReferenceInput, EditButton, DeleteButton,
  Edit, Create, SimpleForm, TextInput, BooleanInput, NumberInput, SelectInput,
  required, useRecordContext,
} from 'react-admin';

export const CardList = () => (
  <List
    sort={{ field: 'name', order: 'ASC' }}
    filters={[
      <TextInput key="q" source="q" label="Пошук" alwaysOn />,
      <ReferenceInput key="category_id" source="category_id" reference="card_categories" label="Категорія">
        <SelectInput optionText="name" />
      </ReferenceInput>,
      <BooleanInput key="is_active" source="is_active" label="Активні" />,
    ]}
  >
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <ReferenceField source="category_id" reference="card_categories" label="Категорія" link={false}>
        <CategoryWithIcon />
      </ReferenceField>
      <TextField source="name" label="Назва картки" />
      <TextField source="description" label="Опис" sx={{ maxWidth: 250, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} />
      <NumberField source="weight" label="Вага" />
      <BooleanField source="is_active" label="Активна" />
      <EditButton label="" />
      <DeleteButton label="" />
    </Datagrid>
  </List>
);

const CategoryWithIcon = () => {
  const record = useRecordContext();
  if (!record) return null;
  return <span>{record.icon} {record.name}</span>;
};

const CardForm = () => (
  <SimpleForm>
    <ReferenceInput source="category_id" reference="card_categories" label="Категорія">
      <SelectInput optionText={(r) => `${r.icon} ${r.name}`} validate={required()} fullWidth />
    </ReferenceInput>
    <TextInput source="name" label="Назва картки" validate={required()} fullWidth />
    <TextInput source="description" label="Опис (що написано на картці)" multiline rows={3} fullWidth />
    <TextInput source="effect" label="Ефект (як впливає на гру)" multiline rows={2} fullWidth />
    <NumberInput
      source="weight"
      label="Вага (ймовірність появи, 1-5)"
      defaultValue={2}
      min={1}
      max={5}
      helperText="1 = рідкісна, 5 = часта"
    />
    <BooleanInput source="is_active" label="Активна" defaultValue />
  </SimpleForm>
);

export const CardEdit = () => (
  <Edit title="Редагувати картку">
    <CardForm />
  </Edit>
);

export const CardCreate = () => (
  <Create title="Нова картка">
    <CardForm />
  </Create>
);
