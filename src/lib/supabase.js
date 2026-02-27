// src/lib/supabase.js
// ─────────────────────────────────────────────────────────
//  Reemplaza las variables de entorno con tus valores de
//  Supabase: Project Settings → API
// ─────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error('⚠️  Faltan variables de entorno de Supabase. Crea el archivo .env con REACT_APP_SUPABASE_URL y REACT_APP_SUPABASE_ANON_KEY');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─────────────────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────────────────

export const authService = {
  // Registrar nuevo usuario
  async signUp({ email, password, name, phone, userType, businessName, businessType }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, phone, user_type: userType, businessName, businessType }
      }
    });
    if (error) throw error;
    return data;
  },

  // Iniciar sesión
  async signIn({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  // Cerrar sesión
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // Obtener sesión actual
  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  // Obtener usuario actual
  async getUser() {
    const { data } = await supabase.auth.getUser();
    return data.user;
  },

  // Escuchar cambios de sesión
  onAuthChange(callback) {
    return supabase.auth.onAuthStateChange((_event, session) => {
      callback(session);
    });
  },

  // Recuperar contraseña por correo
  async resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    });
    if (error) throw error;
  }
};

// ─────────────────────────────────────────────────────────
//  MERCHANTS
// ─────────────────────────────────────────────────────────

export const merchantService = {
  // Obtener todos los negocios activos
  async getAll() {
    const { data, error } = await supabase
      .from('merchants')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(dbToMerchant);
  },

  // Obtener el negocio del usuario actual (dueño)
  async getMine() {
    const user = await authService.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('merchants')
      .select('*')
      .eq('owner_id', user.id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ? dbToMerchant(data) : null;
  },

  // Crear negocio
  async create(merchantData) {
    const user = await authService.getUser();
    if (!user) throw new Error('No autenticado');
    const { data, error } = await supabase
      .from('merchants')
      .insert([{ ...merchantToDb(merchantData), owner_id: user.id }])
      .select()
      .single();
    if (error) throw error;
    return dbToMerchant(data);
  },

  // Actualizar negocio
  async update(merchantData) {
    const { data, error } = await supabase
      .from('merchants')
      .update(merchantToDb(merchantData))
      .eq('id', merchantData.id)
      .select()
      .single();
    if (error) throw error;
    return dbToMerchant(data);
  },

  // Reducir stock al reservar
  async decrementStock(merchantId) {
    const { error } = await supabase.rpc('decrement_bags', { merchant_id: merchantId });
    if (error) {
      // Fallback manual si RPC no existe
      const { data: m } = await supabase.from('merchants').select('bags_available').eq('id', merchantId).single();
      if (m && m.bags_available > 0) {
        await supabase.from('merchants').update({ bags_available: m.bags_available - 1 }).eq('id', merchantId);
      }
    }
  },

  // Restaurar stock al cancelar
  async incrementStock(merchantId) {
    const { data: m } = await supabase.from('merchants').select('bags_available').eq('id', merchantId).single();
    if (m) {
      await supabase.from('merchants').update({ bags_available: m.bags_available + 1 }).eq('id', merchantId);
    }
  },

  // Suscribirse a cambios en tiempo real
  subscribe(callback) {
    return supabase
      .channel('merchants')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchants' }, callback)
      .subscribe();
  }
};

// ─────────────────────────────────────────────────────────
//  ORDERS
// ─────────────────────────────────────────────────────────

export const orderService = {
  // Órdenes del cliente actual
  async getMyOrders() {
    const user = await authService.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from('orders')
      .select('*, merchants(name, image, address, pickup_start, pickup_end, original_price, save_price, location)')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(dbToOrder);
  },

  // Órdenes del negocio (para el dashboard del merchant)
  async getMerchantOrders(merchantId) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  // Crear orden (cliente reserva)
  async create({ merchantId, merchant, amount, code, qrData }) {
    const user = await authService.getUser();
    if (!user) throw new Error('No autenticado');
    const { data, error } = await supabase
      .from('orders')
      .insert([{
        merchant_id:   merchantId,
        customer_id:   user.id,
        customer_name: user.user_metadata?.name || 'Cliente',
        code,
        bags:          1,
        amount,
        status:        'pending',
        qr_data:       qrData,
      }])
      .select()
      .single();
    if (error) throw error;
    // Reducir stock
    await merchantService.decrementStock(merchantId);
    return dbToOrder({ ...data, merchants: merchant });
  },

  // Marcar como completada (recogida)
  async complete(orderId) {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) throw error;
  },

  // Cancelar orden
  async cancel(orderId, merchantId) {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) throw error;
    await merchantService.incrementStock(merchantId);
  },

  // Suscribirse a órdenes en tiempo real (para el negocio)
  subscribeToMerchant(merchantId, callback) {
    return supabase
      .channel(`orders_${merchantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
        filter: `merchant_id=eq.${merchantId}`
      }, callback)
      .subscribe();
  }
};

// ─────────────────────────────────────────────────────────
//  FAVORITES
// ─────────────────────────────────────────────────────────

export const favoriteService = {
  async getAll() {
    const user = await authService.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from('favorites')
      .select('merchant_id')
      .eq('user_id', user.id);
    if (error) throw error;
    return data.map(f => f.merchant_id);
  },

  async toggle(merchantId) {
    const user = await authService.getUser();
    if (!user) return;
    const { data: existing } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', user.id)
      .eq('merchant_id', merchantId)
      .single();

    if (existing) {
      await supabase.from('favorites').delete().eq('id', existing.id);
      return false; // removido
    } else {
      await supabase.from('favorites').insert([{ user_id: user.id, merchant_id: merchantId }]);
      return true; // agregado
    }
  }
};

// ─────────────────────────────────────────────────────────
//  HELPERS: Conversión DB ↔ App
// ─────────────────────────────────────────────────────────

function dbToMerchant(m) {
  return {
    id:            m.id,
    ownerId:       m.owner_id,
    name:          m.name,
    type:          m.type,
    category:      m.category,
    description:   m.description,
    address:       m.address,
    location:      { lat: m.lat || 19.4326, lng: m.lng || -99.1332 },
    phone:         m.phone,
    email:         m.email,
    image:         m.image,
    originalPrice: m.original_price,
    savePrice:     m.save_price,
    bagsAvailable: m.bags_available,
    pickupWindow:  { start: m.pickup_start, end: m.pickup_end },
    rating:        m.rating,
    reviews:       m.reviews,
    totalSaved:    m.total_saved,
    isActive:      m.is_active,
    dietary:       m.dietary || [],
    badges:        m.badges || [],
    createdAt:     m.created_at,
    isNew:         isNewMerchant(m.created_at),
  };
}

function merchantToDb(m) {
  return {
    name:           m.name,
    type:           m.type,
    category:       m.category,
    description:    m.description,
    address:        m.address,
    lat:            m.location?.lat,
    lng:            m.location?.lng,
    phone:          m.phone,
    email:          m.email,
    image:          m.image,
    original_price: m.originalPrice,
    save_price:     m.savePrice,
    bags_available: m.bagsAvailable,
    pickup_start:   m.pickupWindow?.start,
    pickup_end:     m.pickupWindow?.end,
    is_active:      m.isActive !== false,
    dietary:        m.dietary || [],
    badges:         m.badges || [],
  };
}

function dbToOrder(o) {
  const m = o.merchants || {};
  return {
    id:           o.id,
    merchantId:   o.merchant_id,
    merchant: {
      id:            o.merchant_id,
      name:          m.name          || o.merchant_name,
      image:         m.image         || '🍽️',
      address:       m.address       || '',
      originalPrice: m.original_price || 0,
      savePrice:     m.save_price     || o.amount,
      pickupWindow:  { start: m.pickup_start || '20:00', end: m.pickup_end || '22:00' },
      location:      m.location || { lat: 19.4326, lng: -99.1332 },
    },
    customerName:  o.customer_name,
    code:          o.code,
    pickupCode:    o.code,
    bags:          o.bags,
    amount:        o.amount,
    status:        o.status === 'completed' ? 'collected' : o.status,
    qrData:        o.qr_data,
    purchaseDate:  o.created_at,
    createdAt:     o.created_at,
    collectedDate: o.completed_at,
    completedAt:   o.completed_at,
  };
}

function isNewMerchant(createdAt) {
  if (!createdAt) return false;
  const diff = Date.now() - new Date(createdAt).getTime();
  return diff < 7 * 24 * 60 * 60 * 1000; // menos de 7 días
}
