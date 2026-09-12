import { NextResponse } from "next/server";
// import { queryOne } from "@/lib/db/mysql";
import { withApiLogging } from "@/lib/logger";

export const POST = withApiLogging(async (request: Request) => {
  try {
    // const body = await request.json();
    // const username = body.username; 

    // if (!username) {
    //   return NextResponse.json(
    //     { success: false, message: "Username is required" },
    //     { status: 400 }
    //   );
    // }

    // // Fetch user's branch info
    // const user = await queryOne<{
    //   branch_id: number;
    //   latitude: number | string | null;
    //   longitude: number | string | null;
    // }>(
    //   `
    //   SELECT u.branch_id, b.latitude, b.longitude
    //   FROM users u
    //   LEFT JOIN branches b ON u.branch_id = b.id
    //   WHERE u.username = ?
    //   `,
    //   [username]
    // );

    // if (!user) {
    //   return NextResponse.json(
    //     { success: false, message: "User not found" },
    //     { status: 404 }
    //   );
    // }

    // if (!user.branch_id) {
    //   return NextResponse.json(
    //     { success: false, message: "User is not assigned to a branch" },
    //     { status: 400 }
    //   );
    // }

    // if (user.latitude === null || user.longitude === null) {
    //   return NextResponse.json(
    //     { success: false, message: "Branch location is not set" },
    //     { status: 400 }
    //   );
    // }

    return NextResponse.json({
      success: true,
      data: {
        "latitude": 5.554944,
        "longitude": -0.201333
    }
    });
  } catch (error) {
    console.error("Error fetching user location:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch user location" },
      { status: 500 }
    );
  }
}, "user/location:POST")
