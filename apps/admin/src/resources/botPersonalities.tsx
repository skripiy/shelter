'use client';

import {
  List, Datagrid, TextField, BooleanField, SelectField, EditButton, DeleteButton,
  Edit, Create, SimpleForm, TextInput, BooleanInput, SelectInput, ArrayInput, SimpleFormIterator,
  required,
} from 'react-admin';

const styleChoices = [
  { id: 'paranoid',  name: '😰 Параноїк' },
  { id: 'flatterer', name: '🤝 Підлесник' },
  { id: 'quiet',     name: '🤫 Тихоня' },
  { id: 'demagogue', name: '📢 Демагог' },
  { id: 'logical',   name: '🧠 Логік' },
];

export const BotPersonalityList = () => (
  <List sort={{ field: 'name', order: 'ASC' }}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="name" label="Ім'я бота" />
      <SelectField source="style" label="Стиль" choices={styleChoices} />
      <TextField source="description" label="Опис" sx={{ maxWidth: 300, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} />
      <BooleanField source="is_active" label="Активний" />
      <EditButton label="" />
      <DeleteButton label="" />
    </Datagrid>
  </List>
);

const BotForm = () => (
  <SimpleForm>
    <TextInput source="name" label="Ім'я бота" validate={required()} fullWidth />
    <TextInput source="description" label="Опис характеру" multiline rows={3} fullWidth />
    <SelectInput source="style" label="Стиль поведінки" choices={styleChoices} validate={required()} />

    <ArrayInput source="speech_templates" label="Шаблони фраз">
      <SimpleFormIterator>
        <TextInput source="" label="Фраза" fullWidth multiline />
      </SimpleFormIterator>
    </ArrayInput>

    <BooleanInput source="is_active" label="Активний" defaultValue />
  </SimpleForm>
);

export const BotPersonalityEdit = () => (
  <Edit title="Редагувати бота">
    <BotForm />
  </Edit>
);

export const BotPersonalityCreate = () => (
  <Create title="Новий бот">
    <BotForm />
  </Create>
);
