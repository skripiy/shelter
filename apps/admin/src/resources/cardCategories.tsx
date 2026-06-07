'use client';

import {
  List, Datagrid, TextField, NumberField, EditButton, DeleteButton,
  Edit, Create, SimpleForm, TextInput, NumberInput,
  required,
} from 'react-admin';
import Box from '@mui/material/Box';

const ColorDot = ({ record }: { record?: { color?: string } }) =>
  record?.color ? (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        width: 16,
        height: 16,
        borderRadius: '50%',
        backgroundColor: record.color,
        border: '1px solid #ccc',
        verticalAlign: 'middle',
        mr: 1,
      }}
    />
  ) : null;

export const CardCategoryList = () => (
  <List sort={{ field: 'sort_order', order: 'ASC' }}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="icon" label="" sx={{ fontSize: 20 }} />
      <TextField source="name" label="Назва категорії" />
      <TextField source="color" label="Колір" />
      <NumberField source="sort_order" label="Порядок" />
      <EditButton label="" />
      <DeleteButton label="" />
    </Datagrid>
  </List>
);

const CategoryForm = () => (
  <SimpleForm>
    <TextInput source="name" label="Назва категорії" validate={required()} fullWidth />
    <TextInput source="icon" label="Іконка (emoji)" validate={required()} />
    <TextInput source="color" label="Колір (HEX, напр. #3b82f6)" validate={required()} />
    <NumberInput source="sort_order" label="Порядок відображення" defaultValue={0} />
  </SimpleForm>
);

export const CardCategoryEdit = () => (
  <Edit title="Редагувати категорію">
    <CategoryForm />
  </Edit>
);

export const CardCategoryCreate = () => (
  <Create title="Нова категорія">
    <CategoryForm />
  </Create>
);
