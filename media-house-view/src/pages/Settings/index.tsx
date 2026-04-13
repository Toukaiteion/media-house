import { Box } from "@mui/material";
import { Outlet } from "react-router-dom";

export function Settings() { 
    return (
        <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Outlet />
        </Box>
    );
}