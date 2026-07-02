export function serializeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializeOwner(row, currentUser) {
  const id = row.owner_id || row.user_id;
  const isCurrentUser = Boolean(currentUser && id === currentUser.id);

  return {
    owner: id ? {
      id,
      name: row.owner_name || (isCurrentUser ? currentUser.name : '')
    } : null,
    isOwner: row.is_owner ?? isCurrentUser
  };
}

export function serializeGrid(row, currentUser) {
  return {
    id: row.id,
    name: row.name,
    shareDescription: row.share_description,
    banners: row.banners,
    ...serializeOwner(row, currentUser),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function serializeBanner(row, currentUser) {
  return {
    id: row.id,
    name: row.name,
    banner: row.data,
    ...serializeOwner(row, currentUser),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function serializeProductTable(row) {
  return {
    id: row.id,
    name: row.name,
    fileName: row.file_name,
    ...(row.data === undefined ? {} : { data: row.data }),
    sheetCount: row.sheet_count,
    rowCount: row.row_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
