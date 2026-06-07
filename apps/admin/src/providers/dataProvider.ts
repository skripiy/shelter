import { DataProvider, GetListParams, GetOneParams, GetManyParams, GetManyReferenceParams, CreateParams, UpdateParams, UpdateManyParams, DeleteParams, DeleteManyParams } from 'react-admin';
import { supabase } from '../supabaseClient';

const buildFilter = (query: ReturnType<typeof supabase.from<any, any>>, filter: Record<string, unknown>) => {
  let q = query;
  for (const [key, value] of Object.entries(filter)) {
    if (key === 'q' && typeof value === 'string' && value) {
      // Full-text search handled per-resource; skip here
      continue;
    }
    if (value !== undefined && value !== null && value !== '') {
      q = q.eq(key, value) as typeof q;
    }
  }
  return q;
};

export const dataProvider: DataProvider = {
  getList: async (resource: string, params: GetListParams) => {
    const { page, perPage } = params.pagination;
    const { field, order } = params.sort;
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    let query = supabase
      .from(resource)
      .select('*', { count: 'exact' })
      .order(field, { ascending: order === 'ASC' })
      .range(from, to);

    if (params.filter) {
      query = buildFilter(query as any, params.filter) as typeof query;
      // Handle text search
      if (params.filter.q) {
        const searchFields: Record<string, string> = {
          catastrophes: 'name',
          cards: 'name',
          card_categories: 'name',
          shelter_templates: 'name',
          bot_personalities: 'name',
          game_sessions: 'room_code',
        };
        const field = searchFields[resource] || 'name';
        query = query.ilike(field, `%${params.filter.q}%`) as typeof query;
      }
    }

    const { data, count, error } = await query;
    if (error) throw new Error(error.message);
    return { data: data ?? [], total: count ?? 0 };
  },

  getOne: async (resource: string, params: GetOneParams) => {
    const { data, error } = await supabase
      .from(resource)
      .select('*')
      .eq('id', params.id)
      .single();
    if (error) throw new Error(error.message);
    return { data };
  },

  getMany: async (resource: string, params: GetManyParams) => {
    const { data, error } = await supabase
      .from(resource)
      .select('*')
      .in('id', params.ids as string[]);
    if (error) throw new Error(error.message);
    return { data: data ?? [] };
  },

  getManyReference: async (resource: string, params: GetManyReferenceParams) => {
    const { page, perPage } = params.pagination;
    const { field, order } = params.sort;
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data, count, error } = await supabase
      .from(resource)
      .select('*', { count: 'exact' })
      .eq(params.target, params.id)
      .order(field, { ascending: order === 'ASC' })
      .range(from, to);
    if (error) throw new Error(error.message);
    return { data: data ?? [], total: count ?? 0 };
  },

  create: async (resource: string, params: CreateParams) => {
    const { data, error } = await supabase
      .from(resource)
      .insert(params.data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { data };
  },

  update: async (resource: string, params: UpdateParams) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...rest } = params.data as Record<string, unknown>;
    const { data, error } = await supabase
      .from(resource)
      .update(rest)
      .eq('id', params.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { data };
  },

  updateMany: async (resource: string, params: UpdateManyParams) => {
    const { error } = await supabase
      .from(resource)
      .update(params.data)
      .in('id', params.ids as string[]);
    if (error) throw new Error(error.message);
    return { data: params.ids };
  },

  delete: async (resource: string, params: DeleteParams) => {
    const { data, error } = await supabase
      .from(resource)
      .delete()
      .eq('id', params.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { data };
  },

  deleteMany: async (resource: string, params: DeleteManyParams) => {
    const { error } = await supabase
      .from(resource)
      .delete()
      .in('id', params.ids as string[]);
    if (error) throw new Error(error.message);
    return { data: params.ids };
  },
};
