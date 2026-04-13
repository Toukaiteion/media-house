import { Box } from "@mui/material";
import { Outlet } from "react-router-dom";

export function MediaCenter() {
    return (
        <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
            <Outlet />
        </Box>
    );
}
