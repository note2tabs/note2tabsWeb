export { default } from "./transcriber";
import type {GetServerSideProps} from 'next';
import {creditPlacementPreview} from '../lib/creditPlacementPreview';
export const getServerSideProps:GetServerSideProps=async ctx=>({props:process.env.NODE_ENV==='development'&&ctx.query.creditPreview==='1'?{session:creditPlacementPreview}:{}});
