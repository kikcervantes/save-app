// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error('Faltan variables de entorno de Supabase.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────
export const authService = {
  async signUp({ email, password, name, phone, userType, businessName, businessType }) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name, phone, user_type: userType, businessName, businessType } }
    });
    if (error) throw error;
    return data;
  },

  async signIn({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  async getUser() {
    const { data } = await supabase.auth.getUser();
    return data.user;
  },

  onAuthChange(callback) {
    return supabase.auth.onAuthStateChange((_event, session) => {
      callback(session);
    });
  },

  async resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    });
    if (error) throw error;
  }
};

// ─────────────────────────────────────────────
//  STORAGE — fotos y documentos
// ─────────────────────────────────────────────
export const storageService = {
  // Sube un archivo base64 o File a Supabase Storage
  // bucket: 'merchant-photos' | 'verification-docs'
  // path: e.g. 'merchant_abc123/cover.jpg'
  async upload(bucket, path, fileOrBase64, mimeType) {
    let fileData;
    if (typeof fileOrBase64 === 'string' && fileOrBase64.startsWith('data:')) {
      // Convert base64 dataURL to Blob
      const res = await fetch(fileOrBase64);
      fileData  = await res.blob();
    } else {
      fileData = fileOrBase64;
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, fileData, {
        contentType: mimeType || fileData.type || 'application/octet-stream',
        upsert: true,
      });
    if (error) throw error;

    // Get public URL
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    return urlData.publicUrl;
  },

  // Delete a file
  async delete(bucket, path) {
    await supabase.storage.from(bucket).remove([path]);
  },

  // Get public URL without uploading
  getUrl(bucket, path) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }
};

// ─────────────────────────────────────────────
//  MERCHANTS
// ─────────────────────────────────────────────
export const merchantService = {
  async getAll() {
    const { data, error } = await supabase
      .from('merchants')
      .select('*')
      .eq('is_active', true)
      .eq('verified', true)          // ← solo negocios verificados/aprobados
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(dbToMerchant);
  },

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

  async create(merchantData) {
    const user = await authService.getUser();
    if (!user) throw new Error('No autenticado');
    const { data, error } = await supabase
      .from('merchants')
      .insert([{ ...merchantToDb(merchantData), owner_id: user.id, verified: false, verification_status: 'draft' }])
      .select()
      .single();
    if (error) throw error;
    return dbToMerchant(data);
  },

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

  // Admin: approve a merchant
  async approve(merchantId) {
    const { error } = await supabase
      .from('merchants')
      .update({ verified: true, verification_status: 'approved' })
      .eq('id', merchantId);
    if (error) throw error;
  },

  // Admin: reject a merchant
  async reject(merchantId, reason) {
    const { error } = await supabase
      .from('merchants')
      .update({ verified: false, verification_status: 'rejected', rejection_reason: reason })
      .eq('id', merchantId);
    if (error) throw error;
  },

  // Admin: get ALL merchants (including unverified) for review
  async getAllForAdmin() {
    const { data, error } = await supabase
      .from('merchants')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(dbToMerchant);
  },

  async decrementStock(merchantId) {
    const { error } = await supabase.rpc('decrement_bags', { merchant_id: merchantId });
    if (error) {
      const { data: m } = await supabase.from('merchants').select('bags_available').eq('id', merchantId).single();
      if (m && m.bags_available > 0) {
        await supabase.from('merchants').update({ bags_available: m.bags_available - 1 }).eq('id', merchantId);
      }
    }
  },

  async incrementStock(merchantId) {
    const { data: m } = await supabase.from('merchants').select('bags_available').eq('id', merchantId).single();
    if (m) {
      await supabase.from('merchants').update({ bags_available: m.bags_available + 1 }).eq('id', merchantId);
    }
  },

  subscribe(callback) {
    return supabase
      .channel('merchants')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchants' }, callback)
      .subscribe();
  }
};

// ─────────────────────────────────────────────
//  VERIFICATION — documentos de verificación
// ─────────────────────────────────────────────
export const verificationService = {
  // Submit verification docs (uploads files to Storage, saves URLs to DB)
  async submit({ merchantId, info, docs }) {
    // 1. Upload each document to Supabase Storage
    const uploadedDocs = {};
    for (const [key, file] of Object.entries(docs)) {
      if (!file || !file.data) continue;
      try {
        const ext  = file.name.split('.').pop();
        const path = `${merchantId}/${key}_${Date.now()}.${ext}`;
        const url  = await storageService.upload('verification-docs', path, file.data, file.type);
        uploadedDocs[key] = { name: file.name, url, type: file.type };
      } catch (e) {
        console.error(`Error uploading ${key}:`, e);
        uploadedDocs[key] = { name: file.name, url: null, type: file.type };
      }
    }

    // 2. Save verification record to DB
    const { data: existing } = await supabase
      .from('verifications')
      .select('id')
      .eq('merchant_id', merchantId)
      .single();

    const record = {
      merchant_id:  merchantId,
      status:       'pending',
      contact_name: info.contactName,
      contact_phone: info.contactPhone,
      tax_id:       info.taxId,
      website:      info.website || null,
      docs:         uploadedDocs,
      submitted_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await supabase.from('verifications').update(record).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('verifications').insert([record]);
      if (error) throw error;
    }

    // 3. Update merchant verification_status to pending
    await supabase.from('merchants')
      .update({ verification_status: 'pending' })
      .eq('id', merchantId);
  },

  // Get verification for a merchant
  async getMine(merchantId) {
    const { data, error } = await supabase
      .from('verifications')
      .select('*')
      .eq('merchant_id', merchantId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ? dbToVerification(data) : null;
  },

  // Admin: get all verifications
  async getAll() {
    const { data, error } = await supabase
      .from('verifications')
      .select('*, merchants(name, type, address, email, phone, cover_image_url, verification_status, verified)')
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return data.map(v => dbToVerification(v));
  },

  // Admin: approve
  async approve(verificationId, merchantId) {
    await supabase.from('verifications')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', verificationId);
    await merchantService.approve(merchantId);
  },

  // Admin: reject
  async reject(verificationId, merchantId, reason) {
    await supabase.from('verifications')
      .update({ status: 'rejected', rejection_reason: reason, reviewed_at: new Date().toISOString() })
      .eq('id', verificationId);
    await merchantService.reject(merchantId, reason);
  },
};

// ─────────────────────────────────────────────
//  ORDERS
// ─────────────────────────────────────────────
export const orderService = {
  async getMyOrders() {
    const user = await authService.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from('orders')
      .select('*, merchants(name, image, cover_image_url, address, pickup_start, pickup_end, original_price, save_price, location)')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(dbToOrder);
  },

  async getMerchantOrders(merchantId) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async create({ merchantId, merchant, amount, code, qrData }) {
    const user = await authService.getUser();
    if (!user) throw new Error('No autenticado');
    const { data, error } = await supabase
      .from('orders')
      .insert([{
        merchant_id:   merchantId,
        customer_id:   user.id,
        customer_name: user.user_metadata?.name || 'Cliente',
        code, bags: 1, amount, status: 'pending', qr_data: qrData,
      }])
      .select()
      .single();
    if (error) throw error;
    await merchantService.decrementStock(merchantId);
    return dbToOrder({ ...data, merchants: merchant });
  },

  async complete(orderId) {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) throw error;
  },

  async cancel(orderId, merchantId) {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) throw error;
    await merchantService.incrementStock(merchantId);
  },

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

// ─────────────────────────────────────────────
//  FAVORITES
// ─────────────────────────────────────────────
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
      return false;
    } else {
      await supabase.from('favorites').insert([{ user_id: user.id, merchant_id: merchantId }]);
      return true;
    }
  }
};

// ─────────────────────────────────────────────
//  HELPERS: Conversión DB ↔ App
// ─────────────────────────────────────────────
function dbToMerchant(m) {
  return {
    id:                 m.id,
    ownerId:            m.owner_id,
    name:               m.name,
    type:               m.type,
    category:           m.category,
    description:        m.description,
    address:            m.address,
    location:           { lat: m.lat || 19.4326, lng: m.lng || -99.1332 },
    phone:              m.phone,
    email:              m.email,
    image:              m.image,
    coverImage:         m.cover_image_url || null,    // ← URL de Supabase Storage
    originalPrice:      m.original_price,
    savePrice:          m.save_price,
    bagsAvailable:      m.bags_available,
    pickupWindow:       { start: m.pickup_start, end: m.pickup_end },
    rating:             m.rating,
    reviews:            m.reviews,
    totalSaved:         m.total_saved,
    isActive:           m.is_active,
    dietary:            m.dietary || [],
    badges:             m.badges || [],
    verified:           m.verified || false,
    verificationStatus: m.verification_status || 'draft',
    rejectionReason:    m.rejection_reason || null,
    createdAt:          m.created_at,
    isNew:              isNewMerchant(m.created_at),
  };
}

function merchantToDb(m) {
  const db = {
    name:                m.name,
    type:                m.type,
    category:            m.category,
    description:         m.description,
    address:             m.address,
    lat:                 m.location?.lat,
    lng:                 m.location?.lng,
    phone:               m.phone,
    email:               m.email,
    image:               m.image,
    original_price:      m.originalPrice,
    save_price:          m.savePrice,
    bags_available:      m.bagsAvailable,
    pickup_start:        m.pickupWindow?.start,
    pickup_end:          m.pickupWindow?.end,
    is_active:           m.isActive !== false,
    dietary:             m.dietary || [],
    badges:              m.badges  || [],
  };
  // Only include cover_image_url if it's a real URL (not base64)
  if (m.coverImage && m.coverImage.startsWith('http')) {
    db.cover_image_url = m.coverImage;
  }
  return db;
}

function dbToVerification(v) {
  const m = v.merchants || {};
  return {
    id:           v.id,
    merchantId:   v.merchant_id,
    status:       v.status,
    info: {
      contactName:  v.contact_name,
      contactPhone: v.contact_phone,
      taxId:        v.tax_id,
      website:      v.website,
    },
    docs:            v.docs || {},
    submittedAt:     v.submitted_at,
    reviewedAt:      v.reviewed_at,
    rejectionReason: v.rejection_reason,
    // merchant data joined
    businessName:  m.name          || '',
    businessType:  m.type          || '',
    address:       m.address       || '',
    email:         m.email         || '',
    phone:         m.phone         || '',
    coverImage:    m.cover_image_url || null,
    verificationStatus: m.verification_status || v.status,
  };
}

function dbToOrder(o) {
  const m = o.merchants || {};
  return {
    id:           o.id,
    merchantId:   o.merchant_id,
    merchant: {
      id:            o.merchant_id,
      name:          m.name            || o.merchant_name,
      image:         m.image           || '🍽️',
      coverImage:    m.cover_image_url || null,
      address:       m.address         || '',
      originalPrice: m.original_price  || 0,
      savePrice:     m.save_price      || o.amount,
      pickupWindow:  { start: m.pickup_start || '20:00', end: m.pickup_end || '22:00' },
      location:      m.location        || { lat: 19.4326, lng: -99.1332 },
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
  return Date.now() - new Date(createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;
}
