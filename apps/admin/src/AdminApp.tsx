'use client';

import { Admin, Resource, TranslationMessages } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';

import { dataProvider } from './providers/dataProvider';
import { authProvider } from './providers/authProvider';
import { Dashboard } from './dashboard/Dashboard';
import uk from './i18n/uk';

// Resources
import { CatastropheList, CatastropheEdit, CatastropheCreate, CatastropheShow } from './resources/catastrophes';
import { CardCategoryList, CardCategoryEdit, CardCategoryCreate } from './resources/cardCategories';
import { CardList, CardEdit, CardCreate } from './resources/cards';
import { ShelterTemplateList, ShelterTemplateEdit, ShelterTemplateCreate } from './resources/shelterTemplates';
import { BotPersonalityList, BotPersonalityEdit, BotPersonalityCreate } from './resources/botPersonalities';
import { GameSessionList, GameSessionShow } from './resources/gameSessions';

const i18nProvider = polyglotI18nProvider(() => uk as unknown as TranslationMessages, 'uk', {
  allowMissing: true,
  onMissingKey: (key: string) => key,
});

export const AdminApp = () => (
  <Admin
    dataProvider={dataProvider}
    authProvider={authProvider}
    dashboard={Dashboard}
    i18nProvider={i18nProvider}
    title="Shelter Accord"
    requireAuth
    disableTelemetry
  >
    <Resource
      name="catastrophes"
      list={CatastropheList}
      edit={CatastropheEdit}
      create={CatastropheCreate}
      show={CatastropheShow}
      options={{ label: '☢️ Катастрофи' }}
      recordRepresentation="name"
    />
    <Resource
      name="card_categories"
      list={CardCategoryList}
      edit={CardCategoryEdit}
      create={CardCategoryCreate}
      options={{ label: '🗂️ Категорії карток' }}
      recordRepresentation={(r) => `${r.icon} ${r.name}`}
    />
    <Resource
      name="cards"
      list={CardList}
      edit={CardEdit}
      create={CardCreate}
      options={{ label: '🃏 Картки' }}
      recordRepresentation="name"
    />
    <Resource
      name="shelter_templates"
      list={ShelterTemplateList}
      edit={ShelterTemplateEdit}
      create={ShelterTemplateCreate}
      options={{ label: '🏚️ Укриття' }}
      recordRepresentation="name"
    />
    <Resource
      name="bot_personalities"
      list={BotPersonalityList}
      edit={BotPersonalityEdit}
      create={BotPersonalityCreate}
      options={{ label: '🤖 Боти' }}
      recordRepresentation="name"
    />
    <Resource
      name="game_sessions"
      list={GameSessionList}
      show={GameSessionShow}
      options={{ label: '🎮 Ігрові сесії' }}
      recordRepresentation="room_code"
    />
  </Admin>
);
