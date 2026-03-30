const prisma = require("../prisma/client");

function buildSessionUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isWriter: Boolean(user.isWriter),
    writerProfile: {
      penName: user.penName || "",
      bio: user.bio || "",
      preferredGenres: Array.isArray(user.preferredGenres) ? user.preferredGenres : [],
    },
  };
}

function getOrderBy(sort) {
  if (sort === "oldest") {
    return { createdAt: "asc" };
  }
  if (sort === "name_asc") {
    return { name: "asc" };
  }
  return { createdAt: "desc" };
}

function buildRoleWhere(role) {
  if (role === "admin") {
    return { role: "ADMIN" };
  }
  if (role === "writer") {
    return { role: "USER", isWriter: true };
  }
  if (role === "reader") {
    return { role: "USER", isWriter: false };
  }
  return {};
}

function mapDisplayRole(user) {
  if (user.role === "ADMIN") {
    return "admin";
  }
  if (user.isWriter) {
    return "writer";
  }
  return "reader";
}

async function buildPublishedCountMap(userIds) {
  if (!userIds.length) {
    return new Map();
  }

  const rows = await prisma.book.groupBy({
    by: ["createdBy"],
    where: {
      createdBy: { in: userIds },
      status: "PUBLISHED",
    },
    _count: {
      _all: true,
    },
  });

  return new Map(rows.map((row) => [row.createdBy, row._count._all]));
}

function mapUserListItem(user, publishedBooksMap) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    displayRole: mapDisplayRole(user),
    isWriter: Boolean(user.isWriter),
    isAdmin: user.role === "ADMIN",
    accountStatus: null,
    joinedAt: user.createdAt,
    updatedAt: user.updatedAt,
    booksCount: user._count && typeof user._count.books === "number" ? user._count.books : 0,
    publishedBooksCount: publishedBooksMap.get(user.id) || 0,
    penName: user.penName || "",
    bio: user.bio || "",
  };
}

async function getAdminUsers(req, res) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 50);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const role = typeof req.query.role === "string" ? req.query.role.trim().toLowerCase() : "all";
    const sort = typeof req.query.sort === "string" ? req.query.sort.trim().toLowerCase() : "newest";

    const where = {
      ...buildRoleWhere(role),
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const skip = (page - 1) * limit;
    const orderBy = getOrderBy(sort);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isWriter: true,
          penName: true,
          bio: true,
          preferredGenres: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              books: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const publishedBooksMap = await buildPublishedCountMap(users.map((user) => user.id));

    return res.json({
      success: true,
      data: users.map((user) => mapUserListItem(user, publishedBooksMap)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("getAdminUsers error:", error);
    return res.status(500).json({
      success: false,
      error: "Unable to fetch admin users",
    });
  }
}

async function getAdminUserById(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: String(req.params.id) },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isWriter: true,
        penName: true,
        bio: true,
        preferredGenres: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            books: true,
          },
        },
        books: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const publishedBooksMap = await buildPublishedCountMap([user.id]);

    return res.json({
      success: true,
      data: {
        ...mapUserListItem(user, publishedBooksMap),
        preferredGenres: Array.isArray(user.preferredGenres) ? user.preferredGenres : [],
        recentBooks: Array.isArray(user.books) ? user.books : [],
      },
    });
  } catch (error) {
    console.error("getAdminUserById error:", error);
    return res.status(500).json({
      success: false,
      error: "Unable to fetch user details",
    });
  }
}

async function patchAdminUser(req, res) {
  try {
    const userId = String(req.params.id);
    const currentAdminId = req.session && req.session.user ? String(req.session.user.id) : "";
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        isWriter: true,
        name: true,
        email: true,
        penName: true,
        bio: true,
        preferredGenres: true,
      },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const nextRole = req.body.role === "ADMIN" || req.body.role === "USER" ? req.body.role : undefined;
    const nextIsWriter = typeof req.body.isWriter === "boolean" ? req.body.isWriter : undefined;

    if (nextRole === undefined && nextIsWriter === undefined) {
      return res.status(400).json({
        success: false,
        error: "No supported fields provided for update",
      });
    }

    if (userId === currentAdminId && nextRole === "USER") {
      return res.status(400).json({
        success: false,
        error: "You cannot remove your own admin access from this screen",
      });
    }

    const data = {};
    if (nextRole !== undefined) {
      data.role = nextRole;
      if (nextRole === "ADMIN") {
        data.isWriter = false;
      }
    }
    if (nextIsWriter !== undefined && nextRole !== "ADMIN") {
      data.isWriter = nextIsWriter;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isWriter: true,
        penName: true,
        bio: true,
        preferredGenres: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            books: true,
          },
        },
      },
    });

    if (userId === currentAdminId) {
      req.session.user = buildSessionUser(updated);
    }

    const publishedBooksMap = await buildPublishedCountMap([updated.id]);

    return res.json({
      success: true,
      data: mapUserListItem(updated, publishedBooksMap),
    });
  } catch (error) {
    console.error("patchAdminUser error:", error);
    return res.status(500).json({
      success: false,
      error: "Unable to update user",
    });
  }
}

async function deleteAdminUser(req, res) {
  try {
    const userId = String(req.params.id);
    const currentAdminId = req.session && req.session.user ? String(req.session.user.id) : "";

    if (userId === currentAdminId) {
      return res.status(400).json({
        success: false,
        error: "You cannot delete your own account from this screen",
      });
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    await prisma.user.delete({ where: { id: userId } });

    return res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("deleteAdminUser error:", error);
    return res.status(500).json({
      success: false,
      error: "Unable to delete user",
    });
  }
}

module.exports = {
  getAdminUsers,
  getAdminUserById,
  patchAdminUser,
  deleteAdminUser,
};
