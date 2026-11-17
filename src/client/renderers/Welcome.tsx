import {type WelcomeData} from '../../shared/welcome';
import {HUMAN_INVITATION} from '../../shared/philosophy';
import './welcome.css';

export function Welcome({data}:{data:Partial<WelcomeData>}){
 const line=data.line??HUMAN_INVITATION.line,examples=data.examples??HUMAN_INVITATION.examples;
 return <div className="welcome-view"><h2>{line}</h2><p className="welcome-try">Try saying</p><ul>{examples.map((example,index)=><li key={index}>“{example}”</li>)}</ul></div>;
}
