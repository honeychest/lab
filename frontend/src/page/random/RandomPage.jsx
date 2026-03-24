import Layout from '../../shared/ui/layout/Layout.jsx';
import RandomPickerBoard from './RandomPickerBoard.jsx';
import styles from './RandomPage.module.css';

function RandomPage() {
    return (
        <Layout footerCenter={['React', 'Matter.js', 'Random Picker']} enableSupport={true}>
            <section className={styles.pageWrap}>
                <RandomPickerBoard />
            </section>
        </Layout>
    );
}

export default RandomPage;