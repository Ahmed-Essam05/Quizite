import url from 'url';
import path from 'path';

const __filename = url.fileURLToPath(import.meta.url); // used to know the the directory name
const __dirname = path.dirname(__filename); // used to know the the directory name

export default __dirname;
